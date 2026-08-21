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

export async function notifyBookingConfirmed(bookingId: string): Promise<void> {
  await withRetry(async () => {
    const payload = await loadPayload(bookingId);
    if (!payload) return;
    await getNotifier().sendBookingConfirmed(payload);
  }, `sendBookingConfirmed(${bookingId})`);
}

export async function notifyBookingCancelled(bookingId: string): Promise<void> {
  await withRetry(async () => {
    const payload = await loadPayload(bookingId);
    if (!payload) return;
    await getNotifier().sendBookingCancelled(payload);
  }, `sendBookingCancelled(${bookingId})`);
}

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
