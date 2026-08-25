/**
 * Registration codes — the gate on who may register a turf business.
 *
 * Generation and redemption both live here so the normalization rule has
 * exactly one definition. If issuing and redeeming ever disagreed about what
 * "the same code" means, every code issued would be unredeemable.
 */
import { randomInt } from 'node:crypto';
import { prisma } from './prisma';

/**
 * Crockford base32 minus I, L, O and U.
 *
 * I/L/O are dropped because they are unreadable against 1 and 0 in most
 * fonts — these codes get read aloud over the phone and retyped from a
 * screenshot, so a character set that survives transcription matters more
 * than squeezing in extra entropy per character. U is dropped because its
 * absence makes accidental profanity essentially impossible.
 */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const CODE_LENGTH = 10;

/**
 * randomInt, not Math.random: these are a security boundary. Math.random is
 * seeded predictably enough that an attacker who saw a few issued codes could
 * narrow the search space for others.
 *
 * 32^10 is ~2^50. Combined with rate limiting on redemption, guessing is not
 * a practical attack.
 */
export function generateRegistrationCode(): { code: string; display: string } {
  let raw = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    raw += ALPHABET[randomInt(ALPHABET.length)];
  }
  // TURF-XXXXX-XXXXX: grouped for reading aloud and retyping.
  return { code: raw, display: `TURF-${raw.slice(0, 5)}-${raw.slice(5)}` };
}

/**
 * Uppercase, drop the decorative `TURF` prefix, then keep only alphabet
 * characters.
 *
 * ORDER MATTERS, and getting it wrong is silent. `U` is not in the alphabet,
 * so filtering first turns the prefix into `TRF` and leaves 13 characters —
 * meaning the canonical displayed code `TURF-A7K2M-9QX4P` would fail its own
 * length check and be unredeemable. Strip the prefix while it is still
 * intact, then filter.
 *
 * Deliberately forgiving otherwise: `turf-a7k2m-9qx4p`, `A7K2M 9QX4P`, and
 * `TURFA7K2M9QX4P` all normalize to the same thing.
 */
export function normalizeRegistrationCode(input: string): string {
  const upper = input.toUpperCase();
  // Only strip a leading TURF that is followed by a separator or by the full
  // code length — so a code whose own body happens to start with T,R,F is
  // never truncated.
  const withoutPrefix = upper.replace(/^\s*TURF[\s-]*/, '');
  return withoutPrefix
    .split('')
    .filter((c) => ALPHABET.includes(c))
    .join('');
}

export class InvalidRegistrationCodeError extends Error {
  constructor(message = 'That registration code is not valid.') {
    super(message);
    this.name = 'InvalidRegistrationCodeError';
  }
}

export interface ClaimedCode {
  code: string;
  display: string;
  /** Set when this caller had already claimed it and is resuming. */
  resumed: boolean;
}

/**
 * SECURITY-CRITICAL: claims a code for one Clerk user, exactly once.
 *
 * The atomicity comes from `updateMany`'s WHERE clause, NOT from a
 * transaction. Under Postgres READ COMMITTED, a second concurrent UPDATE
 * matching the same row blocks on its row lock, then re-evaluates its WHERE
 * against the *updated* row (EvalPlanQual) and matches zero rows. So exactly
 * one caller can ever see `count === 1`.
 *
 * This is why it does NOT use runSerializable: a Serializable transaction
 * would surface contention as P2034 and drag this into the booking engine's
 * retry-and-error-mapping machinery, for a guarantee a single UPDATE already
 * gives. Fewer moving parts on the path that decides who gets to create a
 * business.
 *
 * Resume, not re-claim: if this same user already holds the code and hasn't
 * finished onboarding (`tenantId` still null), they get it back rather than
 * being told it's used. Otherwise a crash mid-provisioning would strand them
 * behind a code only the operator could replace.
 */
export async function claimRegistrationCode(
  rawInput: string,
  userId: string,
  now: Date = new Date(),
): Promise<ClaimedCode> {
  const code = normalizeRegistrationCode(rawInput);
  if (code.length !== CODE_LENGTH) throw new InvalidRegistrationCodeError();

  const existing = await prisma.registrationCode.findUnique({ where: { code } });
  if (!existing) throw new InvalidRegistrationCodeError();

  // Resume path — checked before the claim, and scoped to this same user so
  // it can never hand someone else's in-flight code over.
  if (existing.redeemedByUserId === userId && existing.tenantId === null && !existing.revokedAt) {
    return { code: existing.code, display: existing.display, resumed: true };
  }

  const claimed = await prisma.registrationCode.updateMany({
    where: {
      code,
      redeemedAt: null,
      revokedAt: null,
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    data: { redeemedAt: now, redeemedByUserId: userId },
  });
  if (claimed.count !== 1) throw new InvalidRegistrationCodeError();

  return { code: existing.code, display: existing.display, resumed: false };
}

/**
 * Releases a claim after onboarding failed, so the code is usable again.
 *
 * Scoped to `redeemedByUserId` and `tenantId: null`: it can only ever
 * release a claim the SAME user still holds, and never one that already
 * produced a business.
 */
export async function releaseRegistrationCode(code: string, userId: string): Promise<void> {
  await prisma.registrationCode.updateMany({
    where: { code, redeemedByUserId: userId, tenantId: null },
    data: { redeemedAt: null, redeemedByUserId: null },
  });
}

/**
 * Phase 2: binds the code to the business it produced. Also scoped to the
 * claiming user, so a code cannot be completed by anyone but its claimant.
 */
export async function completeRegistrationCode(
  code: string,
  userId: string,
  tenantId: string,
): Promise<void> {
  const done = await prisma.registrationCode.updateMany({
    where: { code, redeemedByUserId: userId, tenantId: null },
    data: { tenantId },
  });
  if (done.count !== 1) throw new InvalidRegistrationCodeError();
}
