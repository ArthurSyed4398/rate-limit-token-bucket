# TokenBucket

A small rate limiter implementing the token bucket algorithm. It tracks a capacity of tokens that refills continuously at a steady rate, and reports whether a request can take a token and how long until the next one is available.

## Usage

```js
import { TokenBucket } from './src/index.js';

const bucket = new TokenBucket({ capacity: 10, refillRate: 5 });

const result = bucket.take();
if (result.allowed) {
  // handle request
} else {
  // wait result.retryAfter seconds before retrying
}
```

## Why this exists

Token buckets provide a simple, memory-efficient way to enforce rate limits without requiring a sliding window of timestamps. This implementation favours a continuous refill model over a discrete tick model: tokens accrue every instant rather than in fixed batches. That makes the wait time more accurate when the refill rate is low, at the cost of slightly more arithmetic per `take()` call.

One edge to be aware of: `retryAfter` is rounded up to the nearest millisecond. This avoids telling a caller to retry after zero seconds when the bucket is only fractionally empty, which would otherwise cause a tight retry loop.

## API

### `new TokenBucket({ capacity, refillRate, clock? })`

- `capacity` — maximum number of tokens the bucket can hold. Must be a positive finite number.
- `refillRate` — tokens added per second. Must be a positive finite number.
- `clock` — optional function returning seconds since epoch. Defaults to `() => Date.now() / 1000`. Useful for testing with a fake clock.

### `bucket.take()`

Attempts to take one token.

Returns `{ allowed: boolean, retryAfter: number }`.

- If `allowed` is `true`, a token was consumed and `retryAfter` is `0`.
- If `allowed` is `false`, no token was consumed and `retryAfter` is the number of seconds until at least one token is available, rounded up to the nearest millisecond.

## Performance

The window keeps a bounded buffer, so `push` is constant time and memory does not
grow with the length of the stream. `peak` and `trough` are linear in the window
size, which is the trade that keeps `push` cheap.

