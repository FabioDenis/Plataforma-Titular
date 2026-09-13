import assert from 'node:assert/strict';
import { createServer, request as httpRequest } from 'node:http';
import test, { after } from 'node:test';
import { deleteApp } from 'firebase-admin/app';

process.env.NODE_ENV = 'test';
process.env.FIREBASE_PROJECT_ID = 'demo-titular';
process.env.GCLOUD_PROJECT = 'demo-titular';

const { createApp } = await import('../server');
const { BootstrapConflictError } = await import('./auth-bootstrap');
const { adminApp } = await import('./firebase-admin');
const { bootstrapRegistration, RegistrationBootstrapError } = await import('../src/lib/registration-bootstrap');

after(async () => {
  await deleteApp(adminApp);
});

function testAuth(req: any, res: any, next: any) {
  if (req.headers.authorization !== 'Bearer valid-token') {
    return res.status(401).json({ code: 'INVALID_TOKEN' });
  }
  req.user = { uid: 'verified-user', email: 'verified@example.test' };
  return next();
}

async function withApp(
  bootstrapAccount: Parameters<typeof createApp>[0]['bootstrapAccount'],
  run: (baseUrl: string) => Promise<void>
) {
  const app = await createApp({ bootstrapAccount, verifyAuth: testAuth as any, skipStatic: true });
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

async function post(baseUrl: string, token?: string, body?: unknown) {
  const payload = body === undefined ? undefined : JSON.stringify(body);
  return new Promise<{ status: number; json: any }>((resolve, reject) => {
    const request = httpRequest(`${baseUrl}/api/auth/bootstrap`, {
      method: 'POST',
      headers: {
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(payload ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) } : {}),
      },
    }, (response) => {
      let responseBody = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { responseBody += chunk; });
      response.on('end', () => resolve({
        status: response.statusCode || 0,
        json: responseBody ? JSON.parse(responseBody) : null,
      }));
    });
    request.on('error', reject);
    if (payload) request.write(payload);
    request.end();
  });
}

test('bootstrap rejects missing and invalid tokens before account work', async () => {
  let calls = 0;
  await withApp(async () => {
    calls += 1;
    throw new Error('must not run');
  }, async (baseUrl) => {
    const missing = await post(baseUrl);
    const invalid = await post(baseUrl, 'invalid-token');
    assert.equal(missing.status, 401);
    assert.equal(invalid.status, 401);
  });
  assert.equal(calls, 0);
});

test('bootstrap identity and privileged values come only from the verified token', async () => {
  let receivedIdentity: unknown;
  await withApp(async (identity) => {
    receivedIdentity = identity;
    return {
      user: { id: identity.uid, uid: identity.uid, email: identity.email, role: 'owner' },
      organization: { id: `org_${identity.uid}`, ownerUid: identity.uid, plan: 'trial', publicationLimit: 3 },
    };
  }, async (baseUrl) => {
    const response = await post(baseUrl, 'valid-token', {
      uid: 'attacker', ownerUid: 'attacker', plan: 'enterprise', publicationLimit: 9999,
    });
    assert.equal(response.status, 200);
    const result = response.json;
    assert.equal(result.user.id, 'verified-user');
    assert.equal(result.organization.ownerUid, 'verified-user');
    assert.equal(result.organization.plan, 'trial');
  });
  assert.deepEqual(receivedIdentity, { uid: 'verified-user', email: 'verified@example.test' });
});

test('bootstrap returns safe conflict and backend failure responses', async () => {
  await withApp(async () => { throw new BootstrapConflictError(); }, async (baseUrl) => {
    const response = await post(baseUrl, 'valid-token');
    assert.equal(response.status, 409);
    assert.equal(response.json.code, 'BOOTSTRAP_CONFLICT');
  });

  await withApp(async () => { throw new Error('sensitive Firebase detail'); }, async (baseUrl) => {
    const response = await post(baseUrl, 'valid-token');
    assert.equal(response.status, 500);
    assert.equal(JSON.stringify(response.json).includes('sensitive Firebase detail'), false);
  });
});

test('client deletes only the newly created Auth user after backend bootstrap failure', async () => {
  let deletions = 0;
  const user = {
    getIdToken: async () => 'new-user-token',
    delete: async () => { deletions += 1; },
  };
  const fetcher = async () => new Response('{}', { status: 500 });

  await assert.rejects(
    () => bootstrapRegistration(user, fetcher as typeof fetch),
    (error: any) => error instanceof RegistrationBootstrapError && error.cleanupFailed === false
  );
  assert.equal(deletions, 1);
});

test('client reports the orphan recovery window when Auth compensation fails', async () => {
  const user = {
    getIdToken: async () => 'new-user-token',
    delete: async () => { throw new Error('delete failed'); },
  };
  const fetcher = async () => new Response('{}', { status: 500 });

  await assert.rejects(
    () => bootstrapRegistration(user, fetcher as typeof fetch),
    (error: any) => error instanceof RegistrationBootstrapError &&
      error.cleanupFailed === true &&
      error.message.includes('reintento o recuperación')
  );
});
