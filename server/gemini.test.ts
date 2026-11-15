import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateBackoffMs, calculateEstimatedCostUsd, classifyGeminiError, generateGeminiContent, GeminiError } from './gemini';
import { addKnownCost, validateIdempotencyKey } from './ai-generations';

test('classifies retryable Gemini provider failures', () => {
  assert.deepEqual(classifyGeminiError({ status: 429 }), {
    reason: 'RATE_LIMIT_OR_QUOTA', statusCode: 429, retryable: true,
  });
  assert.deepEqual(classifyGeminiError({ status: 503 }), {
    reason: 'SERVICE_UNAVAILABLE', statusCode: 503, retryable: true,
  });
  assert.deepEqual(classifyGeminiError({ name: 'AbortError' }), {
    reason: 'PROVIDER_TIMEOUT', statusCode: 504, retryable: true,
  });
});

test('does not retry configuration or malformed request failures', () => {
  assert.equal(classifyGeminiError({ status: 401 }).retryable, false);
  assert.equal(classifyGeminiError({ status: 400 }).reason, 'REQUEST_ERROR');
});

test('uses bounded exponential retry backoff with deterministic jitter', () => {
  assert.equal(calculateBackoffMs(0, () => 0.5), 250);
  assert.equal(calculateBackoffMs(2, () => 0.5), 1000);
});

const MILLION = { inputTokens: 1_000_000, outputTokens: 1_000_000, thinkingTokens: 1_000_000, totalTokens: 3_000_000 };

test('estimates cost with the official Gemini price in effect on the generation date', () => {
  // ai.google.dev/gemini-api/docs/pricing (updated 2026-10-28): $0.75 in / $3.75 out (thinking billed as output) until 2026-12-31.
  const october = calculateEstimatedCostUsd('gemini-3.6-flash', MILLION, new Date('2026-10-29T12:00:00Z'));
  assert.equal(october.estimatedCostUsd, 0.75 + 3.75 + 3.75);
  assert.equal(october.pricingVersion, 'gemini-api-pricing-2026-10-28/2026');
  // From 2027-01-01 the same model costs $1.50 in / $7.50 out.
  const january = calculateEstimatedCostUsd('gemini-3.6-flash', MILLION, new Date('2027-01-01T00:00:00Z'));
  assert.equal(january.estimatedCostUsd, 1.5 + 7.5 + 7.5);
  assert.equal(january.pricingVersion, 'gemini-api-pricing-2026-10-28/2027');
});

test('an override with invalid prices is ignored instead of recording NaN costs', () => {
  const previous = process.env.GEMINI_PRICING_JSON;
  process.env.GEMINI_PRICING_JSON = JSON.stringify([
    { from: '2026-01-01', version: 'broken', models: { 'gemini-3.6-flash': { inputPerMillionUsd: 'cheap' } } },
  ]);
  try {
    const cost = calculateEstimatedCostUsd('gemini-3.6-flash', MILLION, new Date('2026-10-29T12:00:00Z'));
    assert.equal(cost.pricingVersion, 'gemini-api-pricing-2026-10-28/2026');
    assert.equal(cost.estimatedCostUsd, 0.75 + 3.75 + 3.75);
  } finally {
    if (previous === undefined) delete process.env.GEMINI_PRICING_JSON;
    else process.env.GEMINI_PRICING_JSON = previous;
  }
});

test('leaves cost unknown for models without a verified price', () => {
  assert.deepEqual(
    calculateEstimatedCostUsd('fake-gemini', { inputTokens: 1, outputTokens: 2, thinkingTokens: 0, totalTokens: 3 }),
    { pricingVersion: null, estimatedCostUsd: null }
  );
});

test('prices can be updated through GEMINI_PRICING_JSON without a code change', () => {
  const previous = process.env.GEMINI_PRICING_JSON;
  process.env.GEMINI_PRICING_JSON = JSON.stringify([
    { from: '2026-01-01', version: 'custom-2026', models: { 'gemini-3.6-flash': { inputPerMillionUsd: 2, outputPerMillionUsd: 10 } } },
  ]);
  try {
    const cost = calculateEstimatedCostUsd('gemini-3.6-flash', MILLION, new Date('2026-10-29T12:00:00Z'));
    assert.deepEqual(cost, { pricingVersion: 'custom-2026', estimatedCostUsd: 2 + 10 + 10 });
  } finally {
    if (previous === undefined) delete process.env.GEMINI_PRICING_JSON;
    else process.env.GEMINI_PRICING_JSON = previous;
  }
});

test('accepts bounded idempotency keys and rejects unsafe values', () => {
  assert.equal(validateIdempotencyKey('request_12345678'), 'request_12345678');
  assert.equal(validateIdempotencyKey('short'), null);
  assert.equal(validateIdempotencyKey('key with spaces'), null);
});

test('retries 429, 500, 503, and 504 at most three times with injected clock and sleep', async () => {
  for (const status of [429, 500, 503, 504]) {
    let calls = 0;
    let now = 0;
    const sleeps: number[] = [];
    const attempts: any[] = [];
    const result = await generateGeminiContent({ contents: 'safe' }, {
      client: { models: { async generateContent() {
        calls += 1;
        if (calls < 3) throw { status };
        return { text: 'ok', usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1, totalTokenCount: 2 } };
      } } },
      clock: () => now, random: () => 0.5,
      sleep: async (ms) => { sleeps.push(ms); now += ms; },
      onAttempt: (attempt) => { attempts.push(attempt); },
    });
    assert.equal(calls, 3);
    assert.equal(result.attempts.length, 3);
    assert.deepEqual(sleeps, [250, 500]);
    assert.equal(attempts.filter((attempt) => attempt.status === 'failed').length, 2);
  }
});

test('keeps aggregate cost null until known and starts summing once a cost is known', () => {
  assert.equal(addKnownCost(null, null), null);
  assert.equal(addKnownCost(undefined, null), null);
  assert.equal(addKnownCost(null, 0.25), 0.25);
  assert.equal(addKnownCost(0.25, 0.5), 0.75);
  assert.equal(addKnownCost(0.75, null), 0.75);
});

test('does not retry 400, 401, or 403 provider failures', async () => {
  for (const status of [400, 401, 403]) {
    let calls = 0;
    await assert.rejects(
      () => generateGeminiContent({ contents: 'safe' }, {
        client: { models: { async generateContent() { calls += 1; throw { status }; } } },
        sleep: async () => { throw new Error('must not sleep'); },
      }),
      (error: any) => error instanceof GeminiError && error.attempts.length === 1
    );
    assert.equal(calls, 1);
  }
});

test('preserves attempts when all configured models fail and honors the total timeout', async () => {
  process.env.GEMINI_FALLBACK_MODELS = 'fake-fallback';
  let calls = 0;
  await assert.rejects(
    () => generateGeminiContent({ contents: 'safe' }, {
      client: { models: { async generateContent() { calls += 1; throw { status: 503 }; } } },
      sleep: async () => {},
    }),
    (error: any) => error instanceof GeminiError && error.attempts.length === 6
  );
  assert.equal(calls, 6);
  delete process.env.GEMINI_FALLBACK_MODELS;

  let now = 0;
  await assert.rejects(
    () => generateGeminiContent({ contents: 'safe' }, {
      client: { models: { async generateContent() { throw { status: 503 }; } } },
      clock: () => now,
      sleep: async () => { now = 75_000; },
    }),
    (error: any) => error instanceof GeminiError && error.reason === 'PROVIDER_TIMEOUT' && error.attempts.length === 1
  );
});

test('provider logs omit request content and response text', async () => {
  const messages: unknown[][] = [];
  const originalInfo = console.info;
  console.info = (...args: unknown[]) => { messages.push(args); };
  try {
    await generateGeminiContent({ contents: 'prompt-secret' }, {
      client: { models: { async generateContent() { return { text: 'response-secret' }; } } },
    });
  } finally {
    console.info = originalInfo;
  }
  assert.equal(JSON.stringify(messages).includes('prompt-secret'), false);
  assert.equal(JSON.stringify(messages).includes('response-secret'), false);
});
