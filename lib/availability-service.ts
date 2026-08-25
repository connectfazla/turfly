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
import { getDefaultVenueId } from './tenant';
import { getDefaultFieldId } from './field';

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

/**
 * `excludeBookingId` leaves one booking out of the "booked" check - used
 * by rescheduleBooking() so a booking never counts as blocking its own
 * old slot when checking whether its new slot is free.
 *
 * `venueId` is a trailing optional parameter (not folded into an options
 * object) SPECIFICALLY so every existing call site - lib/booking-engine.ts
 * included - keeps compiling and behaving identically without being
 * touched in this pass: omitted, it resolves to lib/tenant.ts's
 * getDefaultVenueId() ("Venue Zero"), the only venue that exists right
 * now, so filtering by it changes no query result today. A later pass
 * (once booking-engine.ts's callers can pass a real venueId) is expected
 * to clean this up into a proper options object - CLAUDE.md §4 still
 * applies either way: this stays the ONE function that computes
 * availability, never a second implementation.
 *
 * `fieldId`, same shape one layer down (added in the multi-field pass):
 * omitted, it resolves to lib/field.ts's getDefaultFieldId() for whichever
 * venue was resolved above - a venue's first active field. Every REAL call
 * site as of this pass passes an explicit fieldId (the public booking flow
 * threads it through the URL/hold, the booking engine threads it through
 * every *Input interface) — this fallback exists for the same reason
 * venueId's does: so nothing that isn't touched in this pass is forced to
 * change just to keep compiling.
 */
export async function fetchDayAvailability(
  db: DbClient,
  date: Date,
  now: Date,
  excludeBookingId?: string,
  venueId?: string,
  fieldId?: string,
): Promise<DayAvailabilityResult> {
  const day = dateOnly(date);
  const dayOfWeek = day.getDay();
  const resolvedVenueId = venueId ?? (await getDefaultVenueId());
  const resolvedFieldId = fieldId ?? (await getDefaultFieldId(db, resolvedVenueId));

  const [slotRules, bookings, blackouts] = await Promise.all([
    db.slotRule.findMany({ where: { dayOfWeek, fieldId: resolvedFieldId } }),
    db.booking.findMany({
      where: {
        date: day,
        fieldId: resolvedFieldId,
        id: excludeBookingId ? { not: excludeBookingId } : undefined,
      },
    }),
    db.blackout.findMany({ where: { date: day, fieldId: resolvedFieldId } }),
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
