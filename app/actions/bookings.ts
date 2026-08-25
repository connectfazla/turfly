'use server';

/**
 * Public booking Server Actions. CLAUDE.md §4 order, every action:
 *   zodSchema.parse() -> role check -> domain call -> audit write
 * Public actions have no session/role to check (anonymous), so that step
 * is a no-op here — audit rows are written inside lib/booking-engine.ts,
 * as part of the same transaction as the mutation.
 *
 * Every action returns an ActionResult instead of throwing, so client
 * components can render an error without an error boundary.
 */
import { headers } from 'next/headers';
import {
  BookingEngineError,
  cancelBooking,
  createBooking,
  holdSlot,
} from '@/lib/booking-engine';
import { prisma } from '@/lib/prisma';
import { parseDateParam } from '@/lib/format';
import { slotStart, type SlotIndex } from '@/lib/slots';
import {
  confirmBookingSchema,
  holdSlotSchema,
  lookupBookingSchema,
  publicCancelBookingSchema,
  type ConfirmBookingFormInput,
  type HoldSlotFormInput,
  type LookupBookingFormInput,
  type PublicCancelBookingFormInput,
} from '@/lib/schemas/booking';
import { notifyBookingCancelled } from '@/lib/notify';
import { clientIpFromHeaders, isRateLimited } from '@/lib/auth/rate-limit';
import { getRequestVenueId } from '@/lib/request-venue';

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string; code?: string };

/** Maps any thrown error into a safe, user-facing ActionResult - a raw
 * error message or stack trace never reaches the client. */
function fail(error: unknown, fallback = 'Something went wrong. Please try again.'): ActionResult<never> {
  if (error instanceof BookingEngineError) {
    return { ok: false, error: error.message, code: error.code };
  }
  // Zod throws a ZodError with a readable message on the first issue.
  if (error instanceof Error && error.name === 'ZodError') {
    return { ok: false, error: 'Please check the form and try again.', code: 'VALIDATION' };
  }
  console.error(error);
  return { ok: false, error: fallback };
}

/** Parses a yyyy-MM-dd form field, throwing on anything malformed rather
 * than silently falling back to some other date. */
function badDate(raw: string): Date {
  const date = parseDateParam(raw);
  if (!date) throw new Error('Invalid date');
  return date;
}

// ---------------------------------------------------------------- hold

export interface HoldSlotResult {
  bookingId: string;
  reference: string;
  holdExpiresAt: string; // ISO
}

/** Step 1 of the public flow: called when a visitor clicks an available
 * slot and fills in the quick name+phone dialog. Creates the HELD row
 * (CLAUDE.md §2 invariant 5) that /book/confirm's HoldTimer counts down.
 *
 * Rate-limited per IP (reusing the same bucket/threshold as login —
 * lib/auth/rate-limit.ts). This is the entry point of the public flow:
 * confirmBookingAction can only ever act on a holdId this function
 * issued, so limiting hold creation also caps how many
 * PENDING_VERIFICATION claims one source can spin up. That matters more
 * since payment verification added a claim: an unverified claim can now
 * occupy a slot for up to `paymentVerificationHours` (default 24h) with
 * nothing but a plausible-looking string in the trxId field, versus the
 * old 10-minute HELD window — a much bigger squatting incentive than
 * before. This slows a single scripted source; it does not stop
 * many-IP/many-phone-number abuse (see README §15). */
export async function holdSlotAction(input: HoldSlotFormInput): Promise<ActionResult<HoldSlotResult>> {
  try {
    // Resolved from the request host: dhanmondi.turfly.xyz books Dhanmondi's
    // pitch, the bare domain still books Venue Zero. This is the line that
    // makes one set of booking pages serve every tenant.
    const venueId = await getRequestVenueId();

    const ip = clientIpFromHeaders(await headers());
    // Rate-limit bucket is per venue as well as per IP. Sharing one bucket
    // across venues meant one venue's abusive traffic locked out every other
    // tenant reachable from the same IP or NAT.
    if (await isRateLimited(`hold:${venueId}:${ip}`)) {
      return { ok: false, error: 'Too many attempts. Please wait a while and try again.', code: 'RATE_LIMITED' };
    }
    const parsed = holdSlotSchema.parse(input);
    const booking = await holdSlot({
      venueId,
      fieldId: parsed.fieldId,
      date: badDate(parsed.date),
      slotIndex: parsed.slotIndex,
      phone: parsed.phone,
      fullName: parsed.fullName,
    });
    return {
      ok: true,
      data: {
        bookingId: booking.id,
        reference: booking.reference,
        holdExpiresAt: booking.holdExpiresAt!.toISOString(),
      },
    };
  } catch (err) {
    return fail(err);
  }
}

// ---------------------------------------------------------------- confirm

export interface ConfirmBookingResult {
  reference: string;
}

/** Step 2: called when the /book/confirm form is submitted. Turns the
 * caller's own HELD row (parsed.holdId) into PENDING_VERIFICATION — NOT
 * CONFIRMED. The customer just submitted their bKash advance TRXN; a
 * staff member has to verify it before the booking is actually confirmed
 * (verifyPaymentAction in app/actions/admin-bookings.ts), which is also
 * where notifyBookingConfirmed now fires — sending a "confirmed" email
 * here, before anyone checked the payment, would be a lie. */
export async function confirmBookingAction(
  input: ConfirmBookingFormInput,
): Promise<ActionResult<ConfirmBookingResult>> {
  try {
    const parsed = confirmBookingSchema.parse(input);
    const booking = await createBooking({
      holdId: parsed.holdId,
      date: badDate(parsed.date),
      slotIndex: parsed.slotIndex,
      email: parsed.email,
      address: parsed.address,
      trxId: parsed.trxId,
      teamName: parsed.teamName,
      note: parsed.note,
    });
    return { ok: true, data: { reference: booking.reference } };
  } catch (err) {
    return fail(err);
  }
}

// ---------------------------------------------------------------- lookup

export interface PublicBookingSummary {
  reference: string;
  date: string; // ISO calendar date
  slotIndex: number;
  status: string;
  priceAmount: string;
  canCancelOnline: boolean;
  hoursUntilStart: number;
}

/** Deliberately returns the SAME generic failure whether the reference
 * doesn't exist, the phone doesn't match, or the booking was cancelled
 * long ago — CLAUDE.md §10 / BUILD_PLAN step 4: never reveal which. */
export async function lookupBookingAction(
  input: LookupBookingFormInput,
): Promise<ActionResult<PublicBookingSummary>> {
  const GENERIC_FAILURE = "We couldn't find a matching booking. Check your reference and phone number.";
  try {
    const parsed = lookupBookingSchema.parse(input);
    const booking = await prisma.booking.findUnique({
      where: { reference: parsed.reference },
      include: { customer: true },
    });

    if (!booking || booking.customer.phone !== parsed.phone) {
      return { ok: false, error: GENERIC_FAILURE };
    }

    const start = slotStart(booking.date, booking.slotIndex as SlotIndex);
    const hoursUntilStart = (start.getTime() - Date.now()) / 3_600_000;

    return {
      ok: true,
      data: {
        reference: booking.reference,
        date: booking.date.toISOString(),
        slotIndex: booking.slotIndex,
        status: booking.status,
        priceAmount: booking.priceAmount.toString(),
        canCancelOnline: booking.status === 'CONFIRMED' && hoursUntilStart >= 6,
        hoursUntilStart,
      },
    };
  } catch {
    return { ok: false, error: GENERIC_FAILURE };
  }
}

/** Public users only ever know their reference, never the internal booking
 * id — resolve reference -> id here before handing off to the engine,
 * which (like the staff path) operates on the real id. */
export async function cancelBookingPublicAction(
  input: PublicCancelBookingFormInput,
): Promise<ActionResult<{ status: string }>> {
  const GENERIC_FAILURE = "We couldn't find a matching booking. Check your reference and phone number.";
  try {
    const parsed = publicCancelBookingSchema.parse(input);
    const existing = await prisma.booking.findUnique({
      where: { reference: parsed.reference },
      include: { customer: true },
    });
    if (!existing || existing.customer.phone !== parsed.phone) {
      return { ok: false, error: GENERIC_FAILURE };
    }

    const booking = await cancelBooking({
      bookingId: existing.id,
      actor: { type: 'PUBLIC', phone: parsed.phone },
      reason: parsed.reason,
    });
    void notifyBookingCancelled(booking.id);
    return { ok: true, data: { status: booking.status } };
  } catch (err) {
    return fail(err, GENERIC_FAILURE);
  }
}
