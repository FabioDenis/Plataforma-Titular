import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import type { GeminiAttempt, GeminiResult } from './gemini';

// These values are intentionally set before any Firebase Admin/server import.
process.env.NODE_ENV = 'test';
process.env.FIREBASE_PROJECT_ID = 'demo-titular';
process.env.GCLOUD_PROJECT = 'demo-titular';
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8085';
process.env.GEMINI_FALLBACK_MODELS = '';

const { getAdminDb } = await import('./firebase-admin');
const { createApp } = await import('../server');
const { GeminiError } = await import('./gemini');
const { startGeneration, GenerationStateError } = await import('./ai-generations');

let sequence = 0;

function nextIdentity(limit = 3) {
  sequence += 1;
  return { uid: `test-user-${sequence}`, orgId: `test-org-${sequence}`, limit };
}

function successfulResult(text = JSON.stringify(postResult())): GeminiResult {
  return {
    response: { text }, text, attempts: [], usage: { inputTokens: 10, outputTokens: 5, thinkingTokens: 0, totalTokens: 15 },
    model: 'fake-gemini', modelVersion: 'fake-v1', latencyMs: 1, pricingVersion: null, estimatedCostUsd: null,
  };
}

function successfulAttempt(): GeminiAttempt {
  return {
    model: 'fake-gemini', modelVersion: 'fake-v1', status: 'succeeded', providerHttpStatus: null, reason: null,
    retryCount: 0, latencyMs: 1, usage: { inputTokens: 10, outputTokens: 5, thinkingTokens: 0, totalTokens: 15 },
    pricingVersion: null, estimatedCostUsd: null,
  };
}

function postResult() {
  return {
    feed: { category: 'General', headline: 'Headline', subtitle: 'Subtitle' }, story: { headline: 'Story', subtitle: 'Story subtitle' },
    instagram: { caption: 'Instagram' }, facebook: { caption: 'Facebook' }, linkedin: { caption: 'LinkedIn' },
    hashtags: ['#news'], keywords: ['news'], priority: 'Media', confidence: 90, identityMatchScore: 90,
    appliedTemplateName: 'Default', suggested_template: 'Default',
  };
}

async function seed(identity: ReturnType<typeof nextIdentity>) {
  const db = getAdminDb();
  await Promise.all([
    db.doc(`users/${identity.uid}`).set({ organizationId: identity.orgId }),
    db.doc(`organizations/${identity.orgId}`).set({ ownerUid: identity.uid, publicationLimit: identity.limit, publicationUsed: 0, activeGenerationReservations: 0 }),
  ]);
}

function fakeAuth(req: any, res: any, next: any) {
  if (req.headers.authorization !== 'Bearer test-token') return res.status(401).json({ code: 'INVALID_TOKEN' });
  req.user = { uid: req.headers['x-test-user'], email: 'test@example.invalid' };
  return next();
}

function fakeAuthenticate(req: any) {
  if (req.headers.authorization !== 'Bearer test-token') {
    const error: any = new Error('Authentication is required.');
    error.code = 'UNAUTHORIZED';
    throw error;
  }
  return Promise.resolve({ uid: req.headers['x-test-user'], email: 'test@example.invalid' });
}

async function withApp(dependencies: Parameters<typeof createApp>[0], run: (baseUrl: string) => Promise<void>) {
  const app = await createApp({ ...dependencies, verifyAuth: fakeAuth as any, authenticateRequest: fakeAuthenticate as any, skipStatic: true });
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
  try {
    await run(baseUrl);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

async function request(baseUrl: string, path: string, identity: ReturnType<typeof nextIdentity>, options: { key?: string; bearer?: boolean; body?: unknown } = {}) {
  return fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(options.bearer === false ? {} : { authorization: 'Bearer test-token', 'x-test-user': identity.uid }),
      ...(options.key ? { 'idempotency-key': options.key } : {}),
    },
    body: JSON.stringify(options.body || { article: { title: 'Test article', content: 'Test content' } }),
  });
}

test('Gemini endpoints reject missing bearer before creating documents or calling the provider', async () => {
  const identity = nextIdentity();
  let calls = 0;
  await withApp({ generateGeminiContent: async () => { calls += 1; return successfulResult(); } }, async (baseUrl) => {
    for (const path of ['/api/analyze-template-image', '/api/analyze-custom-template', '/api/analyze-identity-visual', '/api/analyze-identity-editorial', '/api/generate-posts']) {
      const response = await request(baseUrl, path, identity, { bearer: false });
      assert.equal(response.status, 401);
    }
  });
  assert.equal(calls, 0);
  assert.equal((await getAdminDb().doc(`organizations/${identity.orgId}`).get()).exists, false);
});

test('commercial generation completes once, replays persisted output, and aggregates null pricing safely', async () => {
  const identity = nextIdentity();
  await seed(identity);
  let calls = 0;
  const generateGeminiContent: any = async (_request: unknown, dependencies: any) => {
    calls += 1;
    await dependencies.onAttempt(successfulAttempt());
    return successfulResult();
  };
  await withApp({ generateGeminiContent }, async (baseUrl) => {
    const first = await request(baseUrl, '/api/generate-posts', identity, { key: 'replay-key-0001' });
    assert.equal(first.status, 200);
    const firstBody: any = await first.json();
    const replay = await request(baseUrl, '/api/generate-posts', identity, { key: 'replay-key-0001' });
    assert.equal(replay.status, 200);
    assert.deepEqual(await replay.json(), firstBody);
  });
  assert.equal(calls, 1);
  const db = getAdminDb();
  const org = (await db.doc(`organizations/${identity.orgId}`).get()).data()!;
  const generation = (await db.doc(`organizations/${identity.orgId}/aiGenerations/replay-key-0001`).get()).data()!;
  const aggregate = (await db.collection(`organizations/${identity.orgId}/aiUsageMonthly`).get()).docs[0].data();
  assert.equal(org.publicationUsed, 1);
  assert.equal(generation.state, 'completed');
  assert.equal(generation.pricingVersion, null);
  assert.equal(generation.estimatedCostUsd, null);
  assert.equal(aggregate.totalCostUsd, null);
  assert.equal(aggregate.totalTokens, 15);
});

test('nine in-flight duplicates during one held provider call conflict without extra provider calls or consumption', async () => {
  const identity = nextIdentity();
  await seed(identity);
  let calls = 0;
  let releaseWinner!: () => void;
  let signalProviderStarted!: () => void;
  // Explicit barrier instead of a sleep-based race: the winner cannot finalize until every duplicate has been
  // answered, so a late Firestore transaction retry can never observe the completed document here.
  const winnerHeld = new Promise<void>((resolve) => { releaseWinner = resolve; });
  const providerStarted = new Promise<void>((resolve) => { signalProviderStarted = resolve; });
  const generateGeminiContent: any = async (_request: unknown, dependencies: any) => {
    calls += 1;
    await dependencies.onAttempt(successfulAttempt());
    signalProviderStarted();
    await winnerHeld;
    return successfulResult();
  };
  await withApp({ generateGeminiContent }, async (baseUrl) => {
    // Watchdog guarantees the barrier is released even if an assertion fails mid-flight.
    const watchdog = setTimeout(() => releaseWinner(), 15_000);
    try {
      const winner = request(baseUrl, '/api/generate-posts', identity, { key: 'held-winner-key-1' });
      await providerStarted; // The reservation commits before the provider runs, so duplicates now observe it.
      const duplicates = await Promise.all(Array.from({ length: 9 }, () => request(baseUrl, '/api/generate-posts', identity, { key: 'held-winner-key-1' })));
      for (const duplicate of duplicates) assert.equal(duplicate.status, 409);
      releaseWinner();
      assert.equal((await winner).status, 200);
    } finally {
      clearTimeout(watchdog);
      releaseWinner();
    }
  });
  assert.equal(calls, 1);
  const db = getAdminDb();
  const org = (await db.doc(`organizations/${identity.orgId}`).get()).data()!;
  assert.equal(org.publicationUsed, 1);
  assert.equal(org.activeGenerationReservations, 0);
  const generation = (await db.doc(`organizations/${identity.orgId}/aiGenerations/held-winner-key-1`).get()).data()!;
  assert.equal(generation.state, 'completed');
  assert.equal(generation.publicationConsumed, true);
  assert.equal((await db.collection(`organizations/${identity.orgId}/aiGenerations/held-winner-key-1/attempts`).get()).size, 1);
});

test('nine concurrent completed replays return the persisted output without provider calls or extra consumption', async () => {
  const identity = nextIdentity();
  await seed(identity);
  let calls = 0;
  const generateGeminiContent: any = async (_request: unknown, dependencies: any) => {
    calls += 1;
    await dependencies.onAttempt(successfulAttempt());
    return successfulResult();
  };
  await withApp({ generateGeminiContent }, async (baseUrl) => {
    const first = await request(baseUrl, '/api/generate-posts', identity, { key: 'replay-burst-key-1' });
    assert.equal(first.status, 200);
    const firstBody: any = await first.json();
    const replays = await Promise.all(Array.from({ length: 9 }, () => request(baseUrl, '/api/generate-posts', identity, { key: 'replay-burst-key-1' })));
    for (const replay of replays) {
      assert.equal(replay.status, 200);
      assert.deepEqual(await replay.json(), firstBody);
    }
  });
  assert.equal(calls, 1);
  const db = getAdminDb();
  const org = (await db.doc(`organizations/${identity.orgId}`).get()).data()!;
  assert.equal(org.publicationUsed, 1);
  assert.equal(org.activeGenerationReservations, 0);
  const generation = (await db.doc(`organizations/${identity.orgId}/aiGenerations/replay-burst-key-1`).get()).data()!;
  assert.equal(generation.state, 'completed');
  assert.equal(generation.publicationConsumed, true);
});

test('a second key cannot reserve past a publication limit of one', async () => {
  const identity = nextIdentity(1);
  await seed(identity);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  let calls = 0;
  const generateGeminiContent: any = async (_request: unknown, dependencies: any) => {
    calls += 1;
    await dependencies.onAttempt(successfulAttempt());
    await gate;
    return successfulResult();
  };
  await withApp({ generateGeminiContent }, async (baseUrl) => {
    const first = request(baseUrl, '/api/generate-posts', identity, { key: 'limit-first-0001' });
    await new Promise((resolve) => setTimeout(resolve, 20));
    const second = await request(baseUrl, '/api/generate-posts', identity, { key: 'limit-second-001' });
    assert.equal(second.status, 402);
    release();
    assert.equal((await first).status, 200);
  });
  assert.equal(calls, 1);
  assert.equal((await getAdminDb().doc(`organizations/${identity.orgId}`).get()).data()!.publicationUsed, 1);
});

test('provider request and auth failures are terminal, release reservations, and do not consume publications', async () => {
  const identity = nextIdentity();
  await seed(identity);
  for (const status of [400, 401, 403]) {
    let calls = 0;
    const generateGeminiContent: any = async (_request: unknown, dependencies: any) => {
      calls += 1;
      await dependencies.onAttempt({ ...successfulAttempt(), status: 'failed', providerHttpStatus: status, reason: status === 400 ? 'REQUEST_ERROR' : 'AUTH_OR_CONFIGURATION_ERROR' });
      throw new GeminiError('fake provider failure', status === 400 ? 'REQUEST_ERROR' : 'AUTH_OR_CONFIGURATION_ERROR', status, []);
    };
    await withApp({ generateGeminiContent }, async (baseUrl) => {
      const response = await request(baseUrl, '/api/generate-posts', identity, { key: `terminal-${status}-0001` });
      assert.ok(response.status === 400 || response.status === 502);
    });
    assert.equal(calls, 1);
    const generation = (await getAdminDb().doc(`organizations/${identity.orgId}/aiGenerations/terminal-${status}-0001`).get()).data()!;
    assert.equal(generation.state, 'failed');
    assert.equal(generation.publicationConsumed, false);
  }
  const org = (await getAdminDb().doc(`organizations/${identity.orgId}`).get()).data()!;
  assert.equal(org.publicationUsed, 0);
  assert.equal(org.activeGenerationReservations, 0);
});

test('expired reservations are released, auditable, and a new key can claim the capacity', async () => {
  const identity = nextIdentity(1);
  await seed(identity);
  const db = getAdminDb();
  const staleRef = db.doc(`organizations/${identity.orgId}/aiGenerations/stale-reservation`);
  await staleRef.set({ state: 'reserved', commercial: true, reservationExpiresAt: '2000-01-01T00:00:00.000Z' });
  const tracker = await startGeneration({ organizationId: identity.orgId, userId: identity.uid, operation: 'generate-posts', generationId: 'stale-reservation', commercial: true });
  assert.equal(tracker.replay, null);
  const stale = (await staleRef.get()).data()!;
  assert.equal(stale.state, 'reserved');
  assert.equal(stale.reservationReleaseReason, 'RESERVATION_EXPIRED');
  const auditEvents = (await staleRef.collection('auditEvents').get()).docs.map((doc) => doc.data().type);
  assert.ok(auditEvents.includes('reservation_released'));
  assert.ok(auditEvents.includes('reservation_reclaimed'));
});

test('completion cannot revive a failed generation and an aggregate hook rolls back finalization atomically', async () => {
  const identity = nextIdentity();
  await seed(identity);
  const tracker = await startGeneration({ organizationId: identity.orgId, userId: identity.uid, operation: 'generate-posts', generationId: 'failed-terminal-001', commercial: true });
  await tracker.fail('REQUEST_ERROR', 400);
  await assert.rejects(() => tracker.complete(successfulResult(), postResult()), (error: any) => error instanceof GenerationStateError && error.code === 'GENERATION_FAILED');

  let calls = 0;
  const generateGeminiContent: any = async (_request: unknown, dependencies: any) => {
    calls += 1;
    await dependencies.onAttempt(successfulAttempt());
    return successfulResult();
  };
  await withApp({ generateGeminiContent, hooks: { beforeAggregate: () => { throw new Error('aggregate hook'); } } }, async (baseUrl) => {
    const response = await request(baseUrl, '/api/generate-posts', identity, { key: 'aggregate-failure-01' });
    assert.equal(response.status, 500);
  });
  assert.equal(calls, 1);
  const generation = (await getAdminDb().doc(`organizations/${identity.orgId}/aiGenerations/aggregate-failure-01`).get()).data()!;
  assert.equal(generation.state, 'failed');
  assert.equal((await getAdminDb().doc(`organizations/${identity.orgId}`).get()).data()!.publicationUsed, 0);
});

test('test-only stage hooks prove the pre-finalization and post-finalization crash boundaries', async () => {
  const identity = nextIdentity();
  await seed(identity);
  const generateGeminiContent: any = async (_request: unknown, dependencies: any) => {
    await dependencies.onAttempt(successfulAttempt());
    return successfulResult();
  };
  await withApp({ generateGeminiContent, hooks: { postReservationPreGemini: () => { throw new Error('before provider'); } } }, async (baseUrl) => {
    assert.equal((await request(baseUrl, '/api/generate-posts', identity, { key: 'before-provider-001' })).status, 500);
  });
  const before = (await getAdminDb().doc(`organizations/${identity.orgId}/aiGenerations/before-provider-001`).get()).data()!;
  assert.equal(before.state, 'failed');
  await withApp({ generateGeminiContent, hooks: { postGeminiPreFinalization: () => { throw new Error('before final'); } } }, async (baseUrl) => {
    assert.equal((await request(baseUrl, '/api/generate-posts', identity, { key: 'before-final-0001' })).status, 500);
  });
  const beforeFinal = (await getAdminDb().doc(`organizations/${identity.orgId}/aiGenerations/before-final-0001`).get()).data()!;
  assert.equal(beforeFinal.state, 'failed');
  await withApp({ generateGeminiContent, hooks: { postFinalPreHttp: () => { throw new Error('after final'); } } }, async (baseUrl) => {
    assert.equal((await request(baseUrl, '/api/generate-posts', identity, { key: 'after-final-00001' })).status, 500);
  });
  const afterFinal = (await getAdminDb().doc(`organizations/${identity.orgId}/aiGenerations/after-final-00001`).get()).data()!;
  assert.equal(afterFinal.state, 'completed');
  assert.equal((await getAdminDb().doc(`organizations/${identity.orgId}`).get()).data()!.publicationUsed, 1);
});

test('public HTML extraction stays public while AI fallback requires auth and is tracked without publication consumption', async () => {
  const identity = nextIdentity();
  await seed(identity);
  let calls = 0;
  const generateGeminiContent: any = async (_request: unknown, dependencies: any) => {
    calls += 1;
    await dependencies.onAttempt(successfulAttempt());
    return successfulResult(JSON.stringify({ title: 'Fallback article', content: 'This is enough fallback article content for validation.', publisher: 'Example', subtitle: '', category: 'General', publishedAt: '', author: '' }));
  };
  const failingFetch: any = async () => { throw new Error('blocked'); };
  await withApp({ generateGeminiContent, fetch: failingFetch }, async (baseUrl) => {
    const publicResult = await request(baseUrl, '/api/extract', identity, { bearer: false, body: { url: 'https://tumedio.com/2026/07/22/nuevo-programa-inteligencia-artificial-para-pymes/' } });
    assert.equal(publicResult.status, 200);
    const unauthenticatedFallback = await request(baseUrl, '/api/extract', identity, { bearer: false, body: { url: 'https://example.com/blocked-news' } });
    assert.equal(unauthenticatedFallback.status, 401);
    const fallback = await request(baseUrl, '/api/extract', identity, { body: { url: 'https://example.com/blocked-news' } });
    assert.equal(fallback.status, 200);
  });
  assert.equal(calls, 1);
  const generation = (await getAdminDb().collection(`organizations/${identity.orgId}/aiGenerations`).get()).docs[0].data();
  assert.equal(generation.commercial, false);
  assert.equal((await getAdminDb().doc(`organizations/${identity.orgId}`).get()).data()!.publicationUsed, 0);
});
