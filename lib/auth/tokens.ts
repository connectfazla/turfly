/**
 * Single-use, expiring tokens for the three email-driven flows: accepting an
 * invitation, verifying an address, and resetting a password.
 *
 * The token that goes in the email is 32 random bytes, base64url. What is
 * STORED is its SHA-256. That asymmetry is the point: anyone who obtains a
 * database dump — a backup, a read-only replica, a leaked query log — holds
 * hashes they cannot turn back into working links.
 */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { VerificationTokenType } from '@prisma/client';
import { prisma } from '../prisma';

/** Invites get a week — a counter manager might not check email daily.
 * Resets get an hour, because a reset link sitting in an inbox is a
 * standing key to the account. */
const TTL_MS: Record<VerificationTokenType, number> = {
  INVITE: 7 * 24 * 60 * 60_000,
  EMAIL_VERIFY: 24 * 60 * 60_000,
  PASSWORD_RESET: 60 * 60_000,
};

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export interface IssuedToken {
  /** Goes in the email. Never stored. */
  token: string;
  expiresAt: Date;
}

/**
 * Issues a token, invalidating any earlier unused one of the same type.
 *
 * The invalidation matters: without it, every "resend my reset link" leaves
 * the previous link live, so a year of forgotten-password attempts is a year
 * of working keys sitting in an inbox.
 */
export async function issueToken(userId: string, type: VerificationTokenType): Promise<IssuedToken> {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + TTL_MS[type]);

  await prisma.$transaction([
    prisma.verificationToken.updateMany({
      where: { userId, type, usedAt: null },
      data: { usedAt: new Date() },
    }),
    prisma.verificationToken.create({
      data: { id: hashToken(token), userId, type, expiresAt },
    }),
  ]);

  return { token, expiresAt };
}

export type ConsumeResult =
  | { ok: true; userId: string }
  | { ok: false; reason: 'invalid' | 'expired' | 'used' };

/**
 * Redeems a token exactly once.
 *
 * `updateMany` with `usedAt: null` in the WHERE is what makes it single-use
 * under concurrency — two simultaneous clicks on the same link, and only one
 * gets count === 1.
 *
 * Distinguishes expired and already-used from invalid on purpose. "This link
 * has expired, request another" is actionable; "invalid link" for the same
 * situation sends people to support. The distinction leaks only that a token
 * once existed, which the person holding the link already knows.
 */
export async function consumeToken(token: string, type: VerificationTokenType): Promise<ConsumeResult> {
  const id = hashToken(token);
  const row = await prisma.verificationToken.findUnique({ where: { id } });

  if (!row || row.type !== type) return { ok: false, reason: 'invalid' };
  if (row.usedAt) return { ok: false, reason: 'used' };
  if (row.expiresAt <= new Date()) return { ok: false, reason: 'expired' };

  const claimed = await prisma.verificationToken.updateMany({
    where: { id, usedAt: null },
    data: { usedAt: new Date() },
  });
  if (claimed.count !== 1) return { ok: false, reason: 'used' };

  return { ok: true, userId: row.userId };
}

/** Constant-time compare, for anywhere a raw token is checked against another
 * raw token rather than looked up by hash. */
export function tokensMatch(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/** Housekeeping: drop tokens that expired a while ago. Called opportunistically,
 * the same way lib/auth/rate-limit.ts prunes its buckets. */
export async function pruneExpiredTokens(): Promise<void> {
  try {
    await prisma.verificationToken.deleteMany({
      where: { expiresAt: { lt: new Date(Date.now() - 7 * 24 * 60 * 60_000) } },
    });
  } catch (err) {
    console.error('[tokens] prune failed:', err);
  }
}
