/**
 * Login + public-flow rate limiting — CLAUDE.md §5/BUILD_PLAN step 5: 10
 * attempts per 15 minutes per IP, shared across every caller by prefixing
 * the key (e.g. "login:1.2.3.4", "hold:1.2.3.4").
 *
 * Backed by Postgres (RateLimitBucket), not an in-memory Map. Vercel
 * serverless functions are not guaranteed to reuse the same instance
 * between requests — an in-memory bucket would reset (or simply not
 * exist) on the next invocation, silently limiting nothing under real
 * production traffic. The database is the one store every instance
 * actually shares.
 */
import { prisma } from '../prisma';

const WINDOW_MS = 15 * 60_000;
const MAX_ATTEMPTS = 10;
/** Rows older than this are pruned opportunistically (no cron at this
 * project's scale — same pattern as sweepExpiredHolds in
 * lib/booking-engine.ts). A generous multiple of WINDOW_MS so a prune
 * never races a bucket that's still relevant. */
const STALE_AFTER_MS = WINDOW_MS * 4;
/** Only actually run the prune query on a small fraction of calls - it
 * doesn't need to happen every time to keep the table bounded, and
 * skipping it on the common path keeps the hot path to one round trip. */
const PRUNE_PROBABILITY = 0.01;

/** Records one attempt for `key` and returns whether it should be
 * refused. A fixed window that resets WINDOW_MS after the FIRST attempt
 * in it — simpler than a sliding window, good enough for this.
 *
 * Two statements rather than one conditional upsert: Prisma can't express
 * "increment if the window is still live, else reset" in a single
 * upsert(), since the reset condition depends on the row's own current
 * value. A benign race is possible if two requests for the same key both
 * observe a stale window at once (both reset instead of one resetting and
 * one incrementing) — acceptable for abuse prevention, not something that
 * needs to be perfectly atomic. */
export async function isRateLimited(key: string, now: number = Date.now()): Promise<boolean> {
  const nowDate = new Date(now);
  const cutoff = new Date(now - WINDOW_MS);

  if (Math.random() < PRUNE_PROBABILITY) {
    await pruneStaleBuckets(now);
  }

  const bucket = await prisma.rateLimitBucket.upsert({
    where: { key },
    create: { key, count: 1, windowStart: nowDate },
    update: { count: { increment: 1 } },
  });

  if (bucket.windowStart < cutoff) {
    await prisma.rateLimitBucket.update({
      where: { key },
      data: { count: 1, windowStart: nowDate },
    });
    return false;
  }

  return bucket.count > MAX_ATTEMPTS;
}

/** Deletes buckets that are stale even by a generous multiple of the
 * rate-limit window — nothing currently reads them, so this just keeps
 * the table from growing unbounded over the app's lifetime. Failures here
 * are logged, never thrown: a failed prune must not block the actual
 * rate-limit check that triggered it. */
async function pruneStaleBuckets(now: number): Promise<void> {
  try {
    await prisma.rateLimitBucket.deleteMany({
      where: { windowStart: { lt: new Date(now - STALE_AFTER_MS) } },
    });
  } catch (err) {
    console.error('[rate-limit] prune failed:', err);
  }
}

/** Best-effort client IP from standard proxy headers (Vercel sets
 * x-forwarded-for). Falls back to a constant bucket if none is present —
 * still rate-limits, just not per-client, in local/dev environments. */
export function clientIpFromHeaders(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]!.trim();
  return headers.get('x-real-ip') ?? 'unknown';
}
