/**
 * The bridge between Server Actions and the Notifier interface
 * (lib/notifications/). Server Actions call these three functions by
 * booking id right after a mutation commits — never inside the
 * transaction (CLAUDE.md §4). Each call is retried twice with backoff,
 * and any failure (including "retried twice and still failed") is
 * swallowed here: a notification can never roll back or fail a booking.
 */
import { prisma } from './prisma';
import { getNotifier, type BookingNotificationPayload } from './notifications';

const RETRY_DELAYS_MS = [500, 1500]; // two retries, per BUILD_PLAN step 7

/** Runs `fn` up to 3 times total (1 try + 2 retries) with a short backoff
 * between attempts, then swallows the error and logs instead of throwing.
 * A notification that never sends must never surface as a failure to
 * whatever Server Action called this (CLAUDE.md §4). */
async function withRetry(fn: () => Promise<void>, label: string): Promise<void> {
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try {
      await fn();
      return;
    } catch (err) {
      const isLastAttempt = attempt === RETRY_DELAYS_MS.length;
      if (isLastAttempt) {
        console.error(`[notify] ${label} failed after ${attempt + 1} attempt(s):`, err);
        return; // never throw — this must not affect the caller
      }
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[attempt]));
    }
  }
}

/** Re-fetches the booking fresh (Server Actions only pass an id, not the
 * full row) and shapes it into what the Notifier interface expects.
 * Returns null if the booking is gone by the time this runs - notifying
 * about a booking that no longer exists is simply skipped, not an error. */
async function loadPayload(bookingId: string): Promise<BookingNotificationPayload | null> {
  const booking = await prisma.booking.findUnique({ where: { id: bookingId }, include: { customer: true } });
  if (!booking) return null;
  return {
    bookingId: booking.id,
    reference: booking.reference,
    customerName: booking.customer.fullName,
    customerEmail: booking.customer.email,
    date: booking.date,
    slotIndex: booking.slotIndex,
    priceAmount: Number(booking.priceAmount),
  };
}

/** Called after createBooking() (or confirmHeldBooking) commits. */
export async function notifyBookingConfirmed(bookingId: string): Promise<void> {
  await withRetry(async () => {
    const payload = await loadPayload(bookingId);
    if (!payload) return;
    await getNotifier().sendBookingConfirmed(payload);
  }, `sendBookingConfirmed(${bookingId})`);
}

/** Called after cancelBooking() commits, from either the public or staff
 * cancel action. */
export async function notifyBookingCancelled(bookingId: string): Promise<void> {
  await withRetry(async () => {
    const payload = await loadPayload(bookingId);
    if (!payload) return;
    await getNotifier().sendBookingCancelled(payload);
  }, `sendBookingCancelled(${bookingId})`);
}

/** Called after rescheduleBooking() commits. `previous` is the booking's
 * date/slot before the reschedule, captured by the caller beforehand (the
 * booking row itself only holds the new value by the time this runs) - if
 * omitted, the email just won't show a "moved from" line. */
export async function notifyBookingRescheduled(
  bookingId: string,
  previous?: { date: Date; slotIndex: number },
): Promise<void> {
  await withRetry(async () => {
    const payload = await loadPayload(bookingId);
    if (!payload) return;
    await getNotifier().sendBookingRescheduled({
      ...payload,
      previousDate: previous?.date ?? payload.date,
      previousSlotIndex: previous?.slotIndex ?? payload.slotIndex,
    });
  }, `sendBookingRescheduled(${bookingId})`);
}
