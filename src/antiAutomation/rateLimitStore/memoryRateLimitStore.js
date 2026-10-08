// Store contract: consume(key, {now, windowMs, limit}) -> decision.
// A shared implementation must perform this operation atomically.
class MemoryRateLimitStore {
  constructor({ maxKeys = 10000 } = {}) {
    this.buckets = new Map();
    this.maxKeys = maxKeys;
  }
  consume(key, { now, windowMs, limit }) {
    let bucket = this.buckets.get(key);
    if (!bucket || now > bucket.resetAt) {
      if (!bucket && this.buckets.size >= this.maxKeys) {
        for (const [id, value] of this.buckets)
          if (now > value.resetAt) this.buckets.delete(id);
        // Bounded memory; existing active buckets retain their policy.
        if (this.buckets.size >= this.maxKeys)
          return { allowed: false, retryAfterMs: windowMs };
      }
      bucket = { count: 0, resetAt: now + windowMs };
      this.buckets.set(key, bucket);
    }
    if (bucket.count >= limit)
      return {
        allowed: false,
        retryAfterMs: Math.max(0, bucket.resetAt - now),
      };
    bucket.count += 1;
    return { allowed: true, retryAfterMs: 0 };
  }
}
module.exports = { MemoryRateLimitStore };
