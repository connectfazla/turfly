import { slotLabel, type SlotIndex } from '../slots';
import { formatBDT, formatDateLong } from '../format';
import type { BookingNotificationPayload, Notifier, RescheduledNotificationPayload } from './types';

/** Dev notifier — prints to the server console instead of sending real
 * email, so the booking flow is fully testable without Resend keys. */
export class ConsoleNotifier implements Notifier {
  async sendBookingConfirmed(payload: BookingNotificationPayload): Promise<void> {
    this.log('CONFIRMED', payload);
  }

  async sendBookingCancelled(payload: BookingNotificationPayload): Promise<void> {
    this.log('CANCELLED', payload);
  }

  async sendBookingRescheduled(payload: RescheduledNotificationPayload): Promise<void> {
    console.log(
      `[notify] RESCHEDULED ${payload.reference} -> ${payload.customerEmail ?? '(no email)'}: ` +
        `${formatDateLong(payload.previousDate)} ${slotLabel(payload.previousSlotIndex as SlotIndex)} -> ` +
        `${formatDateLong(payload.date)} ${slotLabel(payload.slotIndex as SlotIndex)}`,
    );
  }

  private log(kind: string, payload: BookingNotificationPayload) {
    console.log(
      `[notify] ${kind} ${payload.reference} -> ${payload.customerEmail ?? '(no email)'}: ` +
        `${formatDateLong(payload.date)} ${slotLabel(payload.slotIndex as SlotIndex)} · ${formatBDT(payload.priceAmount)}`,
    );
  }
}
