import assert from 'node:assert/strict';
import test from 'node:test';
import { createRateLimiter } from './rate-limit';

test('allows up to the limit per key and window, then reports when to retry', () => {
  let now = 1_000_000;
  const consume = createRateLimiter({ windowMs: 60_000, max: 2, now: () => now });

  assert.deepEqual(consume('user-a'), { allowed: true, retryAfterSeconds: 0 });
  assert.deepEqual(consume('user-a'), { allowed: true, retryAfterSeconds: 0 });
  now += 15_000;
  assert.deepEqual(consume('user-a'), { allowed: false, retryAfterSeconds: 45 });
});

test('release gives back one use of the current window, never more than were used', () => {
  const consume = createRateLimiter({ windowMs: 60_000, max: 1, now: () => 1_000_000 });

  assert.equal(consume('user-a').allowed, true);
  consume.release('user-a');
  assert.equal(consume('user-a').allowed, true);
  assert.equal(consume('user-a').allowed, false);

  consume.release('user-b');
  consume.release('user-b');
  assert.equal(consume('user-b').allowed, true);
  assert.equal(consume('user-b').allowed, false);
});

test('keys are independent and a new window restores the allowance', () => {
  let now = 1_000_000;
  const consume = createRateLimiter({ windowMs: 60_000, max: 1, now: () => now });

  assert.equal(consume('user-a').allowed, true);
  assert.equal(consume('user-a').allowed, false);
  assert.equal(consume('user-b').allowed, true);
  now += 60_000;
  assert.equal(consume('user-a').allowed, true);
});
