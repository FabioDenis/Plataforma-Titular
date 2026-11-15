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

  const first = consume('user-a');
  assert.equal(first.allowed, true);
  consume.release('user-a', first);
  assert.equal(consume('user-a').allowed, true);
  assert.equal(consume('user-a').allowed, false);

  const other = consume('user-b');
  consume.release('user-b', other);
  consume.release('user-b', other);
  assert.equal(consume('user-b').allowed, true);
  assert.equal(consume('user-b').allowed, false);
});

test('a release after its window ended does not give back a use of the new window', () => {
  let now = 1_000_000;
  const consume = createRateLimiter({ windowMs: 60_000, max: 1, now: () => now });

  const old = consume('user-a');
  now += 60_000;
  assert.equal(consume('user-a').allowed, true);
  consume.release('user-a', old);
  assert.equal(consume('user-a').allowed, false);
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
