import { Resend } from 'resend';
import { render } from '@react-email/components';
import BookingStatusEmail from '../../emails/booking-status-email';
import { slotLabel, type SlotIndex } from '../slots';
import { formatBDT, formatDateLong } from '../format';
import type { BookingNotificationPayload, Notifier, RescheduledNotificationPayload } from './types';

const FROM_ADDRESS = 'Greenfield Turf <bookings@greenfieldturf.example>';

export class ResendNotifier implements Notifier {
  private client: Resend;

  constructor(apiKey: string) {
    this.client = new Resend(apiKey);
  }

  async sendBookingConfirmed(payload: BookingNotificationPayload): Promise<void> {
    if (!payload.customerEmail) return;
    const html = await render(
      BookingStatusEmail({
        heading: 'Booking confirmed',
        intro: 'See you on the pitch — here are your details.',
        reference: payload.reference,
        dateLabel: formatDateLong(payload.date),
        timeLabel: slotLabel(payload.slotIndex as SlotIndex),
        priceLabel: formatBDT(payload.priceAmount),
        accentHex: '#15803D',
      }),
    );
    await this.client.emails.send({
      from: FROM_ADDRESS,
      to: payload.customerEmail,
      subject: `Booking confirmed — ${payload.reference}`,
      html,
    });
  }

  async sendBookingCancelled(payload: BookingNotificationPayload): Promise<void> {
    if (!payload.customerEmail) return;
    const html = await render(
      BookingStatusEmail({
        heading: 'Booking cancelled',
        intro: 'This booking has been cancelled.',
        reference: payload.reference,
        dateLabel: formatDateLong(payload.date),
        timeLabel: slotLabel(payload.slotIndex as SlotIndex),
        priceLabel: formatBDT(payload.priceAmount),
        accentHex: '#B91C1C',
      }),
    );
    await this.client.emails.send({
      from: FROM_ADDRESS,
      to: payload.customerEmail,
      subject: `Booking cancelled — ${payload.reference}`,
      html,
    });
  }

  async sendBookingRescheduled(payload: RescheduledNotificationPayload): Promise<void> {
    if (!payload.customerEmail) return;
    const html = await render(
      BookingStatusEmail({
        heading: 'Booking rescheduled',
        intro: `Moved from ${formatDateLong(payload.previousDate)}, ${slotLabel(payload.previousSlotIndex as SlotIndex)}.`,
        reference: payload.reference,
        dateLabel: formatDateLong(payload.date),
        timeLabel: slotLabel(payload.slotIndex as SlotIndex),
        priceLabel: formatBDT(payload.priceAmount),
        accentHex: '#B45309',
      }),
    );
    await this.client.emails.send({
      from: FROM_ADDRESS,
      to: payload.customerEmail,
      subject: `Booking rescheduled — ${payload.reference}`,
      html,
    });
  }
}
