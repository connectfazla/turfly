import type { BookingNotificationPayload, Notifier, RescheduledNotificationPayload } from './types';

/** Used when NOTIFICATIONS_ENABLED=false. */
export class NoopNotifier implements Notifier {
  async sendBookingConfirmed(_payload: BookingNotificationPayload): Promise<void> {}
  async sendBookingCancelled(_payload: BookingNotificationPayload): Promise<void> {}
  async sendBookingRescheduled(_payload: RescheduledNotificationPayload): Promise<void> {}
}
