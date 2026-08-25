/**
 * Sign-in, sign-up, verification, password reset.
 *
 * Two rules run through all of it:
 *
 *  1. NEVER reveal whether an address has an account. Sign-in, sign-up and
 *     forgot-password all return the same shape whether or not the email is
 *     registered. Your users are business owners; "which turf owners use
 *     Turfly" should not be answerable by anyone with a browser.
 *  2. Every credential path is rate-limited by IP before it touches the
 *     database, so guessing is never free.
 */
'use server';

import { headers } from 'next/headers';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { clientIpFromHeaders, isRateLimited } from '@/lib/auth/rate-limit';
import { fakeVerify, hashPassword, verifyPassword, MIN_PASSWORD_LENGTH } from '@/lib/auth/password';
import { consumeToken, issueToken, pruneExpiredTokens } from '@/lib/auth/tokens';
import { createSession, destroyAllSessions, destroySession, pruneExpiredSessions } from '@/lib/auth/session';
import { sendAuthEmail } from '@/lib/notifications/auth-email';

type ActionResult<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

const emailSchema = z.string().trim().toLowerCase().email('Enter a valid email address');
const passwordSchema = z
  .string()
  .min(MIN_PASSWORD_LENGTH, `Use at least ${MIN_PASSWORD_LENGTH} characters`)
  .max(200, 'That password is too long');

/** Deliberately vague, and the SAME for a wrong password and an unknown
 * address. Splitting them would turn the sign-in form into an account
 * directory. */
const SIGN_IN_FAILED = 'Email or password is incorrect.';

// ---------------------------------------------------------------- sign in

const signInSchema = z.object({ email: emailSchema, password: z.string().min(1, 'Enter your password') });

export async function signInAction(input: z.input<typeof signInSchema>): Promise<ActionResult> {
  const ip = clientIpFromHeaders(await headers());
  if (await isRateLimited(`signin:${ip}`)) {
    return { ok: false, error: 'Too many attempts. Please wait a few minutes and try again.' };
  }

  const parsed = signInSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? SIGN_IN_FAILED };

  const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });

  // Burn equivalent time when there is no account, so response latency does
  // not distinguish "no such user" from "wrong password".
  if (!user) {
    await fakeVerify();
    return { ok: false, error: SIGN_IN_FAILED };
  }

  const valid = await verifyPassword(parsed.data.password, user.passwordHash);
  if (!valid) return { ok: false, error: SIGN_IN_FAILED };

  if (!user.isActive) {
    return { ok: false, error: 'This account has been deactivated. Ask the venue owner to restore it.' };
  }
  if (!user.emailVerifiedAt) {
    return { ok: false, error: 'Please verify your email address. Check your inbox for the link.' };
  }

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await createSession(user.id);
  // Opportunistic housekeeping, not awaited — a slow cleanup must never make
  // signing in feel slow.
  void pruneExpiredSessions();
  return { ok: true };
}

// ---------------------------------------------------------------- sign up

const signUpSchema = z.object({
  name: z.string().trim().min(2, 'Enter your name').max(80),
  email: emailSchema,
  password: passwordSchema,
});

/**
 * Creates an unverified account and emails a verification link.
 *
 * ALWAYS returns ok, even when the address is already registered — otherwise
 * this form answers "does this person have an account". When the address is
 * taken, the existing owner gets an email saying so, which is the only party
 * entitled to learn anything from the attempt.
 */
export async function signUpAction(input: z.input<typeof signUpSchema>): Promise<ActionResult> {
  const ip = clientIpFromHeaders(await headers());
  if (await isRateLimited(`signup:${ip}`)) {
    return { ok: false, error: 'Too many attempts. Please wait a few minutes and try again.' };
  }

  const parsed = signUpSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Check the form.' };

  const existing = await prisma.user.findUnique({ where: { email: parsed.data.email } });

  if (existing) {
    if (existing.passwordHash) {
      // A real account already exists. Tell its owner, not the visitor.
      await sendAuthEmail({
        to: existing.email,
        kind: 'DUPLICATE_SIGNUP',
        name: existing.name,
        url: `${siteUrl()}/forgot-password`,
      }).catch(() => {});
      return { ok: true };
    }
    // Invited but never set a password. Let them claim it — this is the
    // ordinary "owner added me, then I signed up myself" path.
    const hash = await hashPassword(parsed.data.password);
    await prisma.user.update({
      where: { id: existing.id },
      data: { passwordHash: hash, name: parsed.data.name },
    });
    await sendVerification(existing.id, existing.email, parsed.data.name);
    return { ok: true };
  }

  const hash = await hashPassword(parsed.data.password);
  const user = await prisma.user.create({
    data: { email: parsed.data.email, name: parsed.data.name, passwordHash: hash },
  });
  await sendVerification(user.id, user.email, user.name);
  void pruneExpiredTokens();
  return { ok: true };
}

async function sendVerification(userId: string, email: string, name: string) {
  const { token } = await issueToken(userId, 'EMAIL_VERIFY');
  await sendAuthEmail({
    to: email,
    kind: 'EMAIL_VERIFY',
    name,
    url: `${siteUrl()}/verify-email?token=${encodeURIComponent(token)}`,
  }).catch((err: unknown) => console.error('[auth] verification email failed:', err));
}

function siteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
}

// ------------------------------------------------------------ verify email

export async function verifyEmailAction(token: string): Promise<ActionResult> {
  const result = await consumeToken(token, 'EMAIL_VERIFY');
  if (!result.ok) {
    const messages = {
      invalid: 'That verification link is not valid.',
      expired: 'That verification link has expired. Sign in to request a new one.',
      used: 'That link has already been used. Try signing in.',
    } as const;
    return { ok: false, error: messages[result.reason] };
  }

  await prisma.user.update({ where: { id: result.userId }, data: { emailVerifiedAt: new Date() } });
  await createSession(result.userId);
  return { ok: true };
}

// -------------------------------------------------------- forgot / reset

export async function requestPasswordResetAction(rawEmail: string): Promise<ActionResult> {
  const ip = clientIpFromHeaders(await headers());
  if (await isRateLimited(`reset:${ip}`)) {
    return { ok: false, error: 'Too many attempts. Please wait a few minutes and try again.' };
  }

  const parsed = emailSchema.safeParse(rawEmail);
  // Invalid email still returns ok — the response must not vary by whether
  // the input was a real registered address.
  if (!parsed.success) return { ok: true };

  const user = await prisma.user.findUnique({ where: { email: parsed.data } });
  if (user?.isActive) {
    const { token } = await issueToken(user.id, 'PASSWORD_RESET');
    await sendAuthEmail({
      to: user.email,
      kind: 'PASSWORD_RESET',
      name: user.name,
      url: `${siteUrl()}/reset-password?token=${encodeURIComponent(token)}`,
    }).catch((err: unknown) => console.error('[auth] reset email failed:', err));
  }

  void pruneExpiredTokens();
  return { ok: true };
}

const resetSchema = z.object({ token: z.string().min(1), password: passwordSchema });

export async function resetPasswordAction(input: z.input<typeof resetSchema>): Promise<ActionResult> {
  const parsed = resetSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Check the form.' };

  const result = await consumeToken(parsed.data.token, 'PASSWORD_RESET');
  if (!result.ok) {
    const messages = {
      invalid: 'That reset link is not valid.',
      expired: 'That reset link has expired. Request a new one.',
      used: 'That link has already been used. Request a new one.',
    } as const;
    return { ok: false, error: messages[result.reason] };
  }

  const hash = await hashPassword(parsed.data.password);
  await prisma.user.update({
    where: { id: result.userId },
    // Reset also verifies: the person proved control of the inbox by
    // following the link, which is exactly what verification tests.
    data: { passwordHash: hash, emailVerifiedAt: new Date() },
  });

  // Every other session dies. Otherwise "someone knows my password, I'll
  // reset it" would leave the intruder signed in.
  await destroyAllSessions(result.userId);
  await createSession(result.userId);
  return { ok: true };
}

// ----------------------------------------------------------- accept invite

const acceptInviteSchema = z.object({ token: z.string().min(1), password: passwordSchema });

export async function acceptInviteAction(input: z.input<typeof acceptInviteSchema>): Promise<ActionResult> {
  const parsed = acceptInviteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Check the form.' };

  const result = await consumeToken(parsed.data.token, 'INVITE');
  if (!result.ok) {
    const messages = {
      invalid: 'That invitation link is not valid.',
      expired: 'That invitation has expired. Ask the venue owner to send another.',
      used: 'That invitation has already been used. Try signing in.',
    } as const;
    return { ok: false, error: messages[result.reason] };
  }

  const hash = await hashPassword(parsed.data.password);
  await prisma.user.update({
    where: { id: result.userId },
    data: { passwordHash: hash, emailVerifiedAt: new Date(), isActive: true },
  });
  await createSession(result.userId);
  return { ok: true };
}

// ---------------------------------------------------------------- sign out

export async function signOutAction(): Promise<void> {
  await destroySession();
}
