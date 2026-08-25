/**
 * Server-side sessions.
 *
 * A `Session` row plus an opaque cookie, deliberately NOT a self-contained
 * JWT. The deciding case is revocation: an owner deactivating a staff member
 * has to take effect on the next request, and a stateless token stays valid
 * until it expires no matter what the database says. Every request already
 * reads the user to resolve their venue, so the row lookup costs nothing we
 * were not paying anyway.
 *
 * The cookie holds 32 random bytes. What is STORED is its SHA-256, so a
 * database dump contains no usable session credentials.
 */
import { cookies, headers } from 'next/headers';
import { createHash, randomBytes } from 'node:crypto';
import type { User } from '@prisma/client';
import { prisma } from '../prisma';
import { clientIpFromHeaders } from './rate-limit';
import { SESSION_COOKIE } from './constants';

export { SESSION_COOKIE };
const SESSION_TTL_MS = 8 * 60 * 60_000; // 8 hours — CLAUDE.md §5
/** Re-issue the expiry when a session is more than halfway through its life,
 * so an active user is not signed out mid-shift, but an abandoned session on
 * a shared counter machine still dies on schedule. */
const REFRESH_THRESHOLD_MS = SESSION_TTL_MS / 2;

function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Creates a session and sets the cookie. Call ONLY after credentials have
 * actually been verified. */
export async function createSession(userId: string): Promise<void> {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  const h = await headers();

  await prisma.session.create({
    data: {
      id: hashSessionToken(token),
      userId,
      expiresAt,
      userAgent: h.get('user-agent')?.slice(0, 255) ?? null,
      ip: clientIpFromHeaders(h),
    },
  });

  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true, // JS cannot read it, so an XSS bug cannot exfiltrate the session
    sameSite: 'lax', // blocks cross-site POSTs; 'lax' keeps normal link navigation working
    secure: process.env.NODE_ENV === 'production', // http on localhost only
    path: '/',
    expires: expiresAt,
  });
}

export interface SessionUser {
  user: User;
  sessionId: string;
}

/**
 * Resolves the current session, or null.
 *
 * Checks `isActive` here rather than only at sign-in: deactivating a staff
 * member must end their access immediately, not whenever their session
 * happens to expire.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const id = hashSessionToken(token);
  const session = await prisma.session.findUnique({ where: { id }, include: { user: true } });
  if (!session) return null;

  if (session.expiresAt <= new Date()) {
    // Clean up as we go, so expired rows do not accumulate unbounded.
    await prisma.session.delete({ where: { id } }).catch(() => {});
    return null;
  }
  if (!session.user.isActive) return null;

  // Sliding expiry, but only past the halfway mark — writing on every request
  // would turn each page view into a database write for no benefit.
  const remaining = session.expiresAt.getTime() - Date.now();
  if (remaining < REFRESH_THRESHOLD_MS) {
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
    await prisma.session.update({ where: { id }, data: { expiresAt } }).catch(() => {});
  }

  return { user: session.user, sessionId: id };
}

/**
 * Deletes sessions that expired a while ago.
 *
 * getSessionUser() already removes an expired row when it happens to read
 * one, but a session nobody ever returns to is never read again — without
 * this, abandoned rows accumulate forever. Called opportunistically, the same
 * way lib/auth/rate-limit.ts prunes its buckets, so it costs nothing on the
 * hot path.
 */
export async function pruneExpiredSessions(): Promise<void> {
  try {
    await prisma.session.deleteMany({
      where: { expiresAt: { lt: new Date(Date.now() - 7 * 24 * 60 * 60_000) } },
    });
  } catch (err) {
    console.error('[session] prune failed:', err);
  }
}

/** Ends the current session and clears the cookie. */
export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    await prisma.session.delete({ where: { id: hashSessionToken(token) } }).catch(() => {});
  }
  jar.delete(SESSION_COOKIE);
}

/**
 * Ends EVERY session for a user.
 *
 * Called on password change and password reset. Not optional: if changing a
 * password left other sessions alive, then "someone has my password, I'll
 * change it" would fail to actually remove them.
 */
export async function destroyAllSessions(userId: string): Promise<void> {
  await prisma.session.deleteMany({ where: { userId } });
}
