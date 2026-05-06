// ═══════════════════════════════════════════════════════════════
//  Jukebox — in-process rate limiter
//  Sliding window per key. Good enough for single-region Vercel
//  serverless; replace with Upstash or Redis if we ever go
//  multi-region or scale past one warm instance.
// ═══════════════════════════════════════════════════════════════

interface Bucket {
  hits: number[];
}

const buckets = new Map<string, Bucket>();

export interface RateLimitResult {
  ok: boolean;
  retryAfterSec: number;
  remaining: number;
}

export function rateLimit(
  key: string,
  limit: number,
  windowSec: number,
): RateLimitResult {
  const now = Date.now();
  const cutoff = now - windowSec * 1000;

  let b = buckets.get(key);
  if (!b) {
    b = { hits: [] };
    buckets.set(key, b);
  }
  // Drop hits outside the window
  while (b.hits.length && b.hits[0] < cutoff) b.hits.shift();

  if (b.hits.length >= limit) {
    const oldest = b.hits[0]!;
    const retry = Math.ceil((oldest + windowSec * 1000 - now) / 1000);
    return { ok: false, retryAfterSec: Math.max(retry, 1), remaining: 0 };
  }

  b.hits.push(now);
  return { ok: true, retryAfterSec: 0, remaining: limit - b.hits.length };
}

/** Periodically prune empty buckets so the map doesn't grow forever. */
let lastSweep = 0;
export function sweepRateLimit() {
  const now = Date.now();
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  // Drop any bucket with no hits in the last hour
  const cutoff = now - 60 * 60 * 1000;
  buckets.forEach((b, k) => {
    if (!b.hits.length || b.hits[b.hits.length - 1]! < cutoff) {
      buckets.delete(k);
    }
  });
}
