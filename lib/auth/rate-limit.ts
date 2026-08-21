/**
 * Login rate limiting — CLAUDE.md §5/BUILD_PLAN step 5: 10 attempts per 15
 * minutes per IP. In-memory, per-process: fine for this project's single
 * instance; a multi-instance deployment would need a shared store (e.g.
 * Redis) instead.
 */
const WINDOW_MS = 15 * 60_000;
const MAX_ATTEMPTS = 10;

interface Bucket {
  count: number;
  windowStart: number;
}

const buckets = new Map<string, Bucket>();

/** Records one attempt for `key` and returns whether it should be
 * refused. A sliding window would be more precise, but a fixed window
 * that resets WINDOW_MS after the FIRST attempt in it is simpler and
 * good enough for a login form. */
export function isRateLimited(key: string, now: number = Date.now()): boolean {
  const bucket = buckets.get(key);
  if (!bucket || now - bucket.windowStart > WINDOW_MS) {
    buckets.set(key, { count: 1, windowStart: now });
    return false;
  }
  bucket.count += 1;
  return bucket.count > MAX_ATTEMPTS;
}

/** Best-effort client IP from standard proxy headers (Vercel sets
 * x-forwarded-for). Falls back to a constant bucket if none is present —
 * still rate-limits, just not per-client, in local/dev environments. */
export function clientIpFromHeaders(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]!.trim();
  return headers.get('x-real-ip') ?? 'unknown';
}
