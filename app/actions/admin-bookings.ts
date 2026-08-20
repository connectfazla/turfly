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
  rescheduleBooking,
  updateBookingNote,
} from '@/lib/booking-engine';
import { requireRole } from '@/lib/auth/require-role';
import { parseDateParam } from '@/lib/format';
import {
  cancelStaffSchema,
  checkInSchema,
  counterBookingSchema,
  markNoShowSchema,
  recordPaymentSchema,
  rescheduleStaffSchema,
  updateNoteSchema,
  type CounterBookingFormInput,
  type RecordPaymentFormInput,
} from '@/lib/schemas/admin';
import { notifyBookingCancelled, notifyBookingConfirmed, notifyBookingRescheduled } from '@/lib/notify';
import type { ActionResult } from './bookings';

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

function badDate(raw: string) {
  const date = parseDateParam(raw);
  if (!date) throw new Error('Invalid date');
  return date;
}

export async function createCounterBookingAction(
  input: CounterBookingFormInput,
): Promise<ActionResult<{ reference: string }>> {
  try {
    const staff = await requireRole('ADMIN', 'MODERATOR');
    const parsed = counterBookingSchema.parse(input);
    const booking = await createBooking({
      date: badDate(parsed.date),
      slotIndex: parsed.slotIndex,
      phone: parsed.phone,
      fullName: parsed.fullName,
      email: parsed.email,
      teamName: parsed.teamName,
      note: parsed.note,
      source: 'COUNTER',
      createdById: staff.id,
      priceOverride: parsed.priceOverride,
    });
    void notifyBookingConfirmed(booking.id);
    revalidatePath('/admin');
    revalidatePath('/admin/bookings');
    return { ok: true, data: { reference: booking.reference } };
  } catch (err) {
    return fail(err);
  }
}

export async function checkInBookingAction(input: { bookingId: string }): Promise<ActionResult<{ status: string }>> {
  try {
    const staff = await requireRole('ADMIN', 'MODERATOR');
    const parsed = checkInSchema.parse(input);
    const booking = await checkInBooking({ bookingId: parsed.bookingId, staffUserId: staff.id });
    revalidatePath('/admin');
    revalidatePath(`/admin/bookings/${booking.id}`);
    return { ok: true, data: { status: booking.status } };
  } catch (err) {
    return fail(err);
  }
}

export async function markNoShowAction(input: { bookingId: string }): Promise<ActionResult<{ status: string }>> {
  try {
    const staff = await requireRole('ADMIN', 'MODERATOR');
    const parsed = markNoShowSchema.parse(input);
    const booking = await markNoShow({ bookingId: parsed.bookingId, staffUserId: staff.id });
    revalidatePath('/admin');
    revalidatePath(`/admin/bookings/${booking.id}`);
    return { ok: true, data: { status: booking.status } };
  } catch (err) {
    return fail(err);
  }
}

export async function cancelBookingStaffAction(input: {
  bookingId: string;
  reason?: string;
}): Promise<ActionResult<{ status: string }>> {
  try {
    const staff = await requireRole('ADMIN', 'MODERATOR');
    const parsed = cancelStaffSchema.parse(input);
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

export async function rescheduleBookingStaffAction(input: {
  bookingId: string;
  newDate: string;
  newSlotIndex: number;
}): Promise<ActionResult<{ reference: string }>> {
  try {
    const staff = await requireRole('ADMIN', 'MODERATOR');
    const parsed = rescheduleStaffSchema.parse(input);
    const booking = await rescheduleBooking({
      bookingId: parsed.bookingId,
      newDate: badDate(parsed.newDate),
      newSlotIndex: parsed.newSlotIndex,
      staffUserId: staff.id,
    });
    void notifyBookingRescheduled(booking.id);
    revalidatePath('/admin');
    revalidatePath('/admin/bookings');
    revalidatePath(`/admin/bookings/${booking.id}`);
    return { ok: true, data: { reference: booking.reference } };
  } catch (err) {
    return fail(err);
  }
}

export async function recordPaymentAction(input: RecordPaymentFormInput): Promise<ActionResult<{ paymentStatus: string }>> {
  try {
    const staff = await requireRole('ADMIN', 'MODERATOR');
    const parsed = recordPaymentSchema.parse(input);
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

export async function updateBookingNoteAction(input: {
  bookingId: string;
  internalNote: string;
}): Promise<ActionResult<{ ok: true }>> {
  try {
    const staff = await requireRole('ADMIN', 'MODERATOR');
    const parsed = updateNoteSchema.parse(input);
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
