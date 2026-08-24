'use server';

/**
 * Staff booking Server Actions. CLAUDE.md §4 order, every action:
 *   zodSchema.parse() -> role check -> domain call -> audit write
 * requireRole() is the re-check middleware alone cannot provide
 * (CLAUDE.md §7). Audit rows are written inside lib/booking-engine.ts, in
 * the same transaction as each mutation.
 */
import { revalidatePath } from 'next/cache';
import {
  BookingEngineError,
  cancelBooking,
  checkInBooking,
  createBooking,
  markNoShow,
  recordPayment,
  rejectPaymentClaim,
  rescheduleBooking,
  updateBookingNote,
  verifyPaymentClaim,
} from '@/lib/booking-engine';
import { ForbiddenError, requireRole } from '@/lib/auth/require-role';
import { prisma } from '@/lib/prisma';
import { parseDateParam } from '@/lib/format';
import {
  cancelStaffSchema,
  checkInSchema,
  counterBookingSchema,
  markNoShowSchema,
  recordPaymentSchema,
  rejectPaymentSchema,
  rescheduleStaffSchema,
  updateNoteSchema,
  verifyPaymentSchema,
  type CounterBookingFormInput,
  type RecordPaymentFormInput,
  type RejectPaymentFormInput,
} from '@/lib/schemas/admin';
import {
  notifyBookingCancelled,
  notifyBookingConfirmed,
  notifyBookingRescheduled,
} from '@/lib/notify';
import type { ActionResult } from './bookings';

/** Maps any error thrown by requireRole(), a Zod schema, or the booking
 * engine into a safe, user-facing ActionResult - never lets a raw error
 * (with a stack trace or internal detail) reach the client. */
function fail(error: unknown): ActionResult<never> {
  if (error instanceof BookingEngineError) {
    return { ok: false, error: error.message, code: error.code };
  }
  if (error instanceof Error && error.name === 'ZodError') {
    return { ok: false, error: 'Please check the form and try again.', code: 'VALIDATION' };
  }
  if (error instanceof Error && (error.name === 'UnauthorizedError' || error.name === 'ForbiddenError')) {
    return { ok: false, error: error.message, code: error.name };
  }
  console.error(error);
  return { ok: false, error: 'Something went wrong. Please try again.' };
}

/**
 * Refuses a booking that does not belong to the caller's venue.
 *
 * Every action in this file takes a bare `bookingId` straight from a form
 * payload. Without this, a staff member at venue A could check in, cancel,
 * reschedule, annotate, or take payment on venue B's booking simply by
 * substituting an id — a textbook IDOR, and one that crosses a tenant
 * boundary. The role check above proves WHO you are; this proves the row
 * you named is yours to touch.
 *
 * findFirst rather than findUnique: the venueId has to be part of the WHERE,
 * not something we fetch and then compare in JS, so there is no version of
 * this that forgets the comparison. Not-found and not-yours deliberately
 * return the same error, so this cannot be used to probe which booking ids
 * exist on other venues.
 */
async function assertBookingAtVenue(bookingId: string, venueId: string): Promise<void> {
  const found = await prisma.booking.findFirst({
    where: { id: bookingId, venueId },
    select: { id: true },
  });
  if (!found) throw new ForbiddenError('That booking is not available.');
}

/** Parses a yyyy-MM-dd form field into a Date, throwing (caught by
 * fail() above) rather than silently booking the wrong day on bad input. */
function badDate(raw: string) {
  const date = parseDateParam(raw);
  if (!date) throw new Error('Invalid date');
  return date;
}

/** Staff counter booking: goes straight to CONFIRMED, source COUNTER,
 * skips the public 2-active-booking limit (CLAUDE.md §2 invariant 6).
 * Staff choose cash or bKash right on this form (paymentMethod) — if they
 * also enter amountReceived, a Payment row is recorded in the same
 * action, VERIFIED by default (this is staff physically taking the
 * money, or reading their own bKash notification, right now — nothing
 * left to verify, unlike the public advance-payment claim flow). */
export async function createCounterBookingAction(
  input: CounterBookingFormInput,
): Promise<ActionResult<{ reference: string }>> {
  try {
    const staff = await requireRole();
    const parsed = counterBookingSchema.parse(input);
    const booking = await createBooking({
      date: badDate(parsed.date),
      slotIndex: parsed.slotIndex,
      phone: parsed.phone,
      fullName: parsed.fullName,
      email: parsed.email,
      address: parsed.address,
      teamName: parsed.teamName,
      note: parsed.note,
      source: 'COUNTER',
      createdById: staff.id,
      priceOverride: parsed.priceOverride,
    });
    if (parsed.amountReceived) {
      await recordPayment({
        bookingId: booking.id,
        amount: parsed.amountReceived,
        method: parsed.paymentMethod,
        staffUserId: staff.id,
        note: 'Recorded at counter booking creation',
      });
    }
    void notifyBookingConfirmed(booking.id);
    revalidatePath('/admin');
    revalidatePath('/admin/bookings');
    return { ok: true, data: { reference: booking.reference } };
  } catch (err) {
    return fail(err);
  }
}

/** One-tap check-in from the DayTimeline row or the booking detail page. */
export async function checkInBookingAction(input: { bookingId: string }): Promise<ActionResult<{ status: string }>> {
  try {
    const staff = await requireRole();
    const parsed = checkInSchema.parse(input);
    await assertBookingAtVenue(parsed.bookingId, staff.venueId);
    const booking = await checkInBooking({ bookingId: parsed.bookingId, staffUserId: staff.id });
    revalidatePath('/admin');
    revalidatePath(`/admin/bookings/${booking.id}`);
    return { ok: true, data: { status: booking.status } };
  } catch (err) {
    return fail(err);
  }
}

/** Only ever available once the slot has started - see markNoShow() in
 * lib/booking-engine.ts for that guard. */
export async function markNoShowAction(input: { bookingId: string }): Promise<ActionResult<{ status: string }>> {
  try {
    const staff = await requireRole();
    const parsed = markNoShowSchema.parse(input);
    await assertBookingAtVenue(parsed.bookingId, staff.venueId);
    const booking = await markNoShow({ bookingId: parsed.bookingId, staffUserId: staff.id });
    revalidatePath('/admin');
    revalidatePath(`/admin/bookings/${booking.id}`);
    return { ok: true, data: { status: booking.status } };
  } catch (err) {
    return fail(err);
  }
}

/** Unlike the public cancel action, staff can cancel at any time - no
 * 6-hour window check (CLAUDE.md §2 invariant 7: "staff only" after that
 * window closes). */
export async function cancelBookingStaffAction(input: {
  bookingId: string;
  reason?: string;
}): Promise<ActionResult<{ status: string }>> {
  try {
    const staff = await requireRole();
    const parsed = cancelStaffSchema.parse(input);
    await assertBookingAtVenue(parsed.bookingId, staff.venueId);
    const booking = await cancelBooking({
      bookingId: parsed.bookingId,
      actor: { type: 'STAFF', userId: staff.id },
      reason: parsed.reason,
    });
    void notifyBookingCancelled(booking.id);
    revalidatePath('/admin');
    revalidatePath('/admin/bookings');
    revalidatePath(`/admin/bookings/${booking.id}`);
    return { ok: true, data: { status: booking.status } };
  } catch (err) {
    return fail(err);
  }
}

/** Staff-only reschedule (CLAUDE.md §5: no public route for this). Reads
 * the booking's CURRENT date/slot before calling the engine, purely so
 * the confirmation email can say "moved from X to Y" - the engine itself
 * only returns the row's new state, not what it used to be. */
export async function rescheduleBookingStaffAction(input: {
  bookingId: string;
  newDate: string;
  newSlotIndex: number;
}): Promise<ActionResult<{ reference: string }>> {
  try {
    const staff = await requireRole();
    const parsed = rescheduleStaffSchema.parse(input);
    await assertBookingAtVenue(parsed.bookingId, staff.venueId);

    const previous = await prisma.booking.findFirst({
      where: { id: parsed.bookingId, venueId: staff.venueId },
      select: { date: true, slotIndex: true },
    });

    const booking = await rescheduleBooking({
      bookingId: parsed.bookingId,
      newDate: badDate(parsed.newDate),
      newSlotIndex: parsed.newSlotIndex,
      staffUserId: staff.id,
    });
    void notifyBookingRescheduled(booking.id, previous ?? undefined);
    revalidatePath('/admin');
    revalidatePath('/admin/bookings');
    revalidatePath(`/admin/bookings/${booking.id}`);
    return { ok: true, data: { reference: booking.reference } };
  } catch (err) {
    return fail(err);
  }
}

/** Appends one Payment row; a booking can have several (part-payment,
 * balance, refund) so this never overwrites, only adds. */
export async function recordPaymentAction(input: RecordPaymentFormInput): Promise<ActionResult<{ paymentStatus: string }>> {
  try {
    const staff = await requireRole('OWNER', 'MANAGER');
    const parsed = recordPaymentSchema.parse(input);
    await assertBookingAtVenue(parsed.bookingId, staff.venueId);
    const booking = await recordPayment({
      bookingId: parsed.bookingId,
      amount: parsed.amount,
      method: parsed.method,
      note: parsed.note,
      staffUserId: staff.id,
    });
    revalidatePath(`/admin/bookings/${booking.id}`);
    return { ok: true, data: { paymentStatus: booking.paymentStatus } };
  } catch (err) {
    return fail(err);
  }
}

/** PENDING_VERIFICATION -> CONFIRMED. Staff checked their bKash statement
 * and the customer's submitted TRXN really is there — this is the ONLY
 * place a public online booking becomes CONFIRMED (CLAUDE.md's payment-
 * verification invariant: "confirm only after receiving the advance").
 * notifyBookingConfirmed fires HERE, not at submission time. */
export async function verifyPaymentAction(input: { bookingId: string }): Promise<ActionResult<{ status: string }>> {
  try {
    const staff = await requireRole('OWNER', 'MANAGER');
    const parsed = verifyPaymentSchema.parse(input);
    await assertBookingAtVenue(parsed.bookingId, staff.venueId);
    const booking = await verifyPaymentClaim({ bookingId: parsed.bookingId, staffUserId: staff.id });
    void notifyBookingConfirmed(booking.id);
    revalidatePath('/admin');
    revalidatePath('/admin/bookings');
    revalidatePath(`/admin/bookings/${booking.id}`);
    return { ok: true, data: { status: booking.status } };
  } catch (err) {
    return fail(err);
  }
}

/** PENDING_VERIFICATION -> CANCELLED. The submitted TRXN didn't check out
 * (never arrived, wrong amount, doesn't exist) — releases the slot
 * immediately instead of waiting for the auto-expiry deadline. */
export async function rejectPaymentAction(input: RejectPaymentFormInput): Promise<ActionResult<{ status: string }>> {
  try {
    const staff = await requireRole('OWNER', 'MANAGER');
    const parsed = rejectPaymentSchema.parse(input);
    await assertBookingAtVenue(parsed.bookingId, staff.venueId);
    const booking = await rejectPaymentClaim({
      bookingId: parsed.bookingId,
      staffUserId: staff.id,
      reason: parsed.reason,
    });
    void notifyBookingCancelled(booking.id);
    revalidatePath('/admin');
    revalidatePath('/admin/bookings');
    revalidatePath(`/admin/bookings/${booking.id}`);
    return { ok: true, data: { status: booking.status } };
  } catch (err) {
    return fail(err);
  }
}

/** Staff-only annotation, never shown to the customer. */
export async function updateBookingNoteAction(input: {
  bookingId: string;
  internalNote: string;
}): Promise<ActionResult<{ ok: true }>> {
  try {
    const staff = await requireRole();
    const parsed = updateNoteSchema.parse(input);
    await assertBookingAtVenue(parsed.bookingId, staff.venueId);
    const booking = await updateBookingNote({
      bookingId: parsed.bookingId,
      internalNote: parsed.internalNote,
      staffUserId: staff.id,
    });
    revalidatePath(`/admin/bookings/${booking.id}`);
    return { ok: true, data: { ok: true } };
  } catch (err) {
    return fail(err);
  }
}
