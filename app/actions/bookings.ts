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
import { notifyBookingCancelled, notifyBookingConfirmed } from '@/lib/notify';

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string; code?: string };

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

export async function holdSlotAction(input: HoldSlotFormInput): Promise<ActionResult<HoldSlotResult>> {
  try {
    const parsed = holdSlotSchema.parse(input);
    const booking = await holdSlot({
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
      teamName: parsed.teamName,
      note: parsed.note,
    });
    void notifyBookingConfirmed(booking.id); // outside the transaction, fire-and-forget
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
