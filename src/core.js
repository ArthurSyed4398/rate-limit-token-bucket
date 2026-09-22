/**
 * A rate limiter based on the token bucket algorithm.
 *
 * The bucket starts full and refills continuously at a steady rate.
 * Taking a token consumes one unit of capacity. If no token is
 * available, the request is rejected and the caller learns how long
 * until the next token arrives.
 *
 * The clock is injected so tests can control time deterministically.
 */
export class TokenBucket {
  /**
   * @param {Object} options
   * @param {number} options.capacity  Maximum tokens the bucket can hold.
   * @param {number} options.refillRate Tokens added per second. Must be > 0.
   * @param {() => number} [options.clock]  Function returning seconds since epoch.
   *   Defaults to `() => Date.now() / 1000`.
   */
  constructor({ capacity, refillRate, clock = () => Date.now() / 1000 }) {
    if (!Number.isFinite(capacity) || capacity <= 0) {
      throw new RangeError('capacity must be a positive finite number');
    }
    if (!Number.isFinite(refillRate) || refillRate <= 0) {
      throw new RangeError('refillRate must be a positive finite number');
    }
    if (typeof clock !== 'function') {
      throw new TypeError('clock must be a function');
    }

    this.capacity = capacity;
    this.refillRate = refillRate;
    this.clock = clock;

    // Start full. Using the current time makes the first take() deterministic.
    this.tokens = capacity;
    this.lastRefill = clock();
  }

  /**
   * Attempt to take a token.
   *
   * @returns {{ allowed: boolean, retryAfter: number }}
   *   `retryAfter` is 0 when allowed, otherwise the number of seconds until
   *   at least one token is available, rounded up to avoid a zero wait when
   *   the bucket is only fractionally empty.
   */
  take() {
    const now = this.clock();
    this.#refill(now);

    if (this.tokens >= 1) {
      this.tokens -= 1;
      return { allowed: true, retryAfter: 0 };
    }

    // tokens is in [0, 1). One token arrives after (1 - tokens) / refillRate.
    const retryAfter = Math.ceil((1 - this.tokens) / this.refillRate * 1000) / 1000;
    return { allowed: false, retryAfter };
  }

  /**
   * Add tokens earned since the last refill. Caps at capacity.
   */
  #refill(now) {
    const elapsed = now - this.lastRefill;
    if (elapsed > 0) {
      this.tokens = Math.min(this.capacity, this.tokens + elapsed * this.refillRate);
      this.lastRefill = now;
    }
  }
}
