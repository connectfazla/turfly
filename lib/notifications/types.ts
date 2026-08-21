/**
 * The Notifier interface — BUILD_PLAN.md step 7: ResendNotifier,
 * ConsoleNotifier (dev), NoopNotifier (NOTIFICATIONS_ENABLED=false).
 * Notifications are a side effect OUTSIDE the booking transaction
 * (CLAUDE.md §4) — every call here happens after a booking has already
 * committed, and a failure here must never roll anything back. See
 * lib/notify.ts for the retry-with-backoff wrapper that enforces that.
 */
export interface BookingNotificationPayload {
  bookingId: string;
  reference: string;
  customerName: string;
  customerEmail: string | null;
  date: Date;
  slotIndex: number;
  priceAmount: number;
}

export interface RescheduledNotificationPayload extends BookingNotificationPayload {
  previousDate: Date;
  previousSlotIndex: number;
}

export interface Notifier {
  sendBookingConfirmed(payload: BookingNotificationPayload): Promise<void>;
  sendBookingCancelled(payload: BookingNotificationPayload): Promise<void>;
  sendBookingRescheduled(payload: RescheduledNotificationPayload): Promise<void>;
}
