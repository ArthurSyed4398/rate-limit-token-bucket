import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TokenBucket } from '../src/core.js';

function fakeClock(start = 0) {
  let now = start;
  return {
    now: () => now,
    advance: (seconds) => { now += seconds; },
  };
}

test('starts full and allows a take', () => {
  const clock = fakeClock(100);
  const bucket = new TokenBucket({ capacity: 5, refillRate: 1, clock: clock.now });

  assert.deepEqual(bucket.take(), { allowed: true, retryAfter: 0 });
});

test('takes tokens until empty, then rejects', () => {
  const clock = fakeClock(100);
  const bucket = new TokenBucket({ capacity: 2, refillRate: 1, clock: clock.now });

  assert.deepEqual(bucket.take(), { allowed: true, retryAfter: 0 });
  assert.deepEqual(bucket.take(), { allowed: true, retryAfter: 0 });
  assert.deepEqual(bucket.take(), { allowed: false, retryAfter: 1 });
});

test('retryAfter is rounded up to avoid zero wait', () => {
  const clock = fakeClock(100);
  const bucket = new TokenBucket({ capacity: 1, refillRate: 10, clock: clock.now });

  // Take the only token.
  assert.deepEqual(bucket.take(), { allowed: true, retryAfter: 0 });

  // 0.01 seconds later, 0.1 tokens have refilled.
  clock.advance(0.01);
  const result = bucket.take();
  assert.equal(result.allowed, false);
  assert.equal(result.retryAfter, 0.09); // ceil((1 - 0.1) / 10 * 1000) / 1000
});

test('refills over time and allows new takes', () => {
  const clock = fakeClock(100);
  const bucket = new TokenBucket({ capacity: 3, refillRate: 2, clock: clock.now });

  bucket.take();
  bucket.take();
  bucket.take();
  assert.deepEqual(bucket.take(), { allowed: false, retryAfter: 0.5 });

  // After 1 second, 2 tokens are available.
  clock.advance(1);
  assert.deepEqual(bucket.take(), { allowed: true, retryAfter: 0 });
  assert.deepEqual(bucket.take(), { allowed: true, retryAfter: 0 });
  assert.deepEqual(bucket.take(), { allowed: false, retryAfter: 0.5 });
});

test('capacity limits the number of stored tokens', () => {
  const clock = fakeClock(100);
  const bucket = new TokenBucket({ capacity: 1, refillRate: 100, clock: clock.now });

  bucket.take(); // empty the bucket

  // Advance a long time. Even though 1000 tokens could have been added,
  // the bucket holds at most 1.
  clock.advance(10);
  assert.deepEqual(bucket.take(), { allowed: true, retryAfter: 0 });
  assert.deepEqual(bucket.take(), { allowed: false, retryAfter: 0.01 });
});

test('handles fractional tokens correctly', () => {
  const clock = fakeClock(100);
  const bucket = new TokenBucket({ capacity: 1, refillRate: 1, clock: clock.now });

  // Cannot take because only 0.5 tokens exist.
  clock.advance(0.5);
  assert.deepEqual(bucket.take(), { allowed: true, retryAfter: 0 });
});

test('clock that moves backwards does not remove tokens', () => {
  const clock = fakeClock(100);
  const bucket = new TokenBucket({ capacity: 2, refillRate: 1, clock: clock.now });

  bucket.take();
  bucket.take();

  // Move the clock backwards. The bucket should not lose tokens it did not have.
  clock.advance(-5);
  assert.deepEqual(bucket.take(), { allowed: false, retryAfter: 1 });
});

test('rejects invalid constructor arguments', () => {
  assert.throws(() => new TokenBucket({ capacity: 0, refillRate: 1 }), RangeError);
  assert.throws(() => new TokenBucket({ capacity: -1, refillRate: 1 }), RangeError);
  assert.throws(() => new TokenBucket({ capacity: 1, refillRate: 0 }), RangeError);
  assert.throws(() => new TokenBucket({ capacity: 1, refillRate: -1 }), RangeError);
  assert.throws(() => new TokenBucket({ capacity: 1, refillRate: 1, clock: 'now' }), TypeError);
});

test('refillRate less than 1 yields waits greater than 1 second', () => {
  const clock = fakeClock(100);
  const bucket = new TokenBucket({ capacity: 1, refillRate: 0.5, clock: clock.now });

  bucket.take();
  assert.deepEqual(bucket.take(), { allowed: false, retryAfter: 2 });
});

test('does not refill when no time has passed', () => {
  const clock = fakeClock(100);
  const bucket = new TokenBucket({ capacity: 2, refillRate: 1, clock: clock.now });

  bucket.take();
  bucket.take();

  // Same timestamp as before: no refill should happen.
  assert.deepEqual(bucket.take(), { allowed: false, retryAfter: 1 });
});

test('take() updates lastRefill even when rejected', () => {
  const clock = fakeClock(100);
  const bucket = new TokenBucket({ capacity: 1, refillRate: 1, clock: clock.now });

  bucket.take(); // allowed, tokens = 0, lastRefill = 100
  clock.advance(0.5);
  assert.deepEqual(bucket.take(), { allowed: false, retryAfter: 0.5 });

  // The rejected take should have refilled and updated lastRefill to 100.5.
  // After another 0.5 seconds, exactly one token should be available.
  clock.advance(0.5);
  assert.deepEqual(bucket.take(), { allowed: true, retryAfter: 0 });
});
