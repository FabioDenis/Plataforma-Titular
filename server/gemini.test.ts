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

test('leaves cost unconfigured until verified pricing is supplied', () => {
  assert.deepEqual(
    calculateEstimatedCostUsd('gemini-3.6-flash', { inputTokens: 1, outputTokens: 2, thinkingTokens: 0, totalTokens: 3 }),
    { pricingVersion: null, estimatedCostUsd: null }
  );
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
