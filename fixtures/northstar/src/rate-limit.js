const buckets = new Map();

export function resetRateLimits() {
  buckets.clear();
}

/**
 * Token bucket. capacity = burst, refillPerSec restores tokens.
 */
export function allow(identity, { capacity = 5, refillPerSec = 1 } = {}) {
  const now = Date.now();
  let b = buckets.get(identity);
  if (!b) {
    b = { tokens: capacity, updatedAt: now };
    buckets.set(identity, b);
  }
  const elapsed = (now - b.updatedAt) / 1000;
  b.tokens = Math.min(capacity, b.tokens + elapsed * refillPerSec);
  b.updatedAt = now;
  if (b.tokens < 1) return false;
  b.tokens -= 1;
  return true;
}
