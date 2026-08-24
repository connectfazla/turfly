/**
 * Fetches this day's SlotRule / Booking / Blackout rows and runs them
 * through the single pure getDayAvailability() function. This is the ONE
 * place that turns Prisma rows into availability — used by the public
 * /book pages, the /api/availability JSON route, the admin panel and the
 * booking engine's own transactions. Never write a second implementation
 * (CLAUDE.md §4).
 */
import type { Prisma, PrismaClient } from '@prisma/client';
import {
  getDayAvailability,
  type AvailabilityBlackout,
  type AvailabilityBooking,
  type AvailabilitySlotRule,
} from './availability';
import type { SlotView } from './slots';

/** Accepts either the top-level Prisma client or a transaction client, so
 * the booking engine can call this from inside a transaction and everyone
 * else can call it with the plain singleton. */
export type DbClient = PrismaClient | Prisma.TransactionClient;

export interface DayAvailabilityResult {
  day: Date;
  dayOfWeek: number;
  ruleByIndex: Map<number, AvailabilitySlotRule>;
  slots: SlotView[];
}

/**
 * Converts a Date carrying the INTENDED local calendar day (its local Y/M/D
 * — e.g. from parseDateParam, or lib/slots.ts arithmetic) into the exact
 * Date value Prisma expects for a `@db.Date` column.
 *
 * Prisma serializes `@db.Date` fields using the Date object's UTC Y/M/D,
 * not its local Y/M/D. A local-midnight Date (`new Date(y, m, d)`) in any
 * positive-UTC-offset timezone — this app is fixed to Asia/Dhaka, UTC+6 —
 * falls on the PREVIOUS day in UTC, so Prisma would store/query the wrong
 * calendar date. Building UTC-midnight with the same digits instead keeps
 * every write and every `where: { date }` filter aligned with what's
 * actually in Postgres. This is the one place that boundary is crossed —
 * every write path (booking-engine.ts) and read path (this file) for
 * Booking.date / Blackout.date funnels through here.
 */
export function dateOnly(d: Date): Date {
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
}

/** `excludeBookingId` leaves one booking out of the "booked" check - used
 * by rescheduleBooking() so a booking never counts as blocking its own
 * old slot when checking whether its new slot is free. */
export async function fetchDayAvailability(
  db: DbClient,
  date: Date,
  now: Date,
  excludeBookingId?: string,
): Promise<DayAvailabilityResult> {
  const day = dateOnly(date);
  const dayOfWeek = day.getDay();

  const [slotRules, bookings, blackouts] = await Promise.all([
    db.slotRule.findMany({ where: { dayOfWeek } }),
    db.booking.findMany({
      where: {
        date: day,
        id: excludeBookingId ? { not: excludeBookingId } : undefined,
      },
    }),
    db.blackout.findMany({ where: { date: day } }),
  ]);

  const availabilitySlotRules: AvailabilitySlotRule[] = slotRules.map((r) => ({
    slotIndex: r.slotIndex,
    isBookable: r.isBookable,
    price: Number(r.price),
  }));
  const availabilityBookings: AvailabilityBooking[] = bookings.map((b) => ({
    slotIndex: b.slotIndex,
    status: b.status,
    holdExpiresAt: b.holdExpiresAt,
    paymentVerificationExpiresAt: b.paymentVerificationExpiresAt,
  }));
  const availabilityBlackouts: AvailabilityBlackout[] = blackouts.map((b) => ({
    slotIndex: b.slotIndex,
  }));

  return {
    day,
    dayOfWeek,
    ruleByIndex: new Map(availabilitySlotRules.map((r) => [r.slotIndex, r])),
    slots: getDayAvailability({
      date: day,
      now,
      slotRules: availabilitySlotRules,
      bookings: availabilityBookings,
      blackouts: availabilityBlackouts,
    }) as SlotView[],
  };
}
