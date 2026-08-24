/**
 * Default pricing used only to seed SlotRule rows. Once seeded, the price of
 * a given (dayOfWeek, slotIndex) lives in the database (SlotRule.price) and
 * is edited from /admin/pricing — this file is not consulted at booking time.
 *
 * Pure: no next/react/@prisma/client imports.
 */
import { isNoonSlot, isPeakSlot, isWeekend, MAINTENANCE_SLOT, SLOTS_PER_DAY } from './slots';

// Three price tiers × weekday/weekend (noon is flat, same price every day):
//   NOON      09:00–15:00              — the cheapest, lowest-demand window
//   AFTERNOON everything else non-peak — early morning + late evening/night
//   NIGHT     16:30–23:00 (peak)       — highest-demand evening window
export const NOON_PRICE = 2500; // BDT, per 90-minute slot, every day
export const AFTERNOON_PRICE = 3000; // weekday
export const WEEKEND_AFTERNOON_PRICE = 3500;
export const NIGHT_PRICE = 3500; // weekday evening peak
export const WEEKEND_NIGHT_PRICE = 4000;

/** Default seed price for a slot. Maintenance slot gets a nominal 0 — never sold. */
export function defaultSlotPrice(dayOfWeek: number, slotIndex: number): number {
  if (slotIndex === MAINTENANCE_SLOT) return 0;
  if (isNoonSlot(slotIndex)) return NOON_PRICE;

  const weekend = isWeekend(dayOfWeekToSampleDate(dayOfWeek));
  const peak = isPeakSlot(slotIndex);

  if (weekend && peak) return WEEKEND_NIGHT_PRICE;
  if (weekend) return WEEKEND_AFTERNOON_PRICE;
  if (peak) return NIGHT_PRICE;
  return AFTERNOON_PRICE;
}

/**
 * isWeekend() takes a Date. For seeding we only have a dayOfWeek integer, so
 * build a stable reference date that falls on that weekday (2024-01-07 was a
 * Sunday = dayOfWeek 0).
 */
function dayOfWeekToSampleDate(dayOfWeek: number): Date {
  const base = new Date(2024, 0, 7); // Sunday
  base.setDate(base.getDate() + dayOfWeek);
  return base;
}

export const ALL_DAYS_OF_WEEK = Object.freeze([0, 1, 2, 3, 4, 5, 6]);
export const WEEKEND_DAYS_OF_WEEK = Object.freeze([5, 6]); // Fri, Sat — matches isWeekend()
export const WEEKDAY_DAYS_OF_WEEK = Object.freeze([0, 1, 2, 3, 4]);

/** isWeekend() for a bare dayOfWeek integer (0..6) instead of a Date -
 * SlotRule rows are keyed by dayOfWeek, not an actual calendar date. */
export function isWeekendDayOfWeek(dayOfWeek: number): boolean {
  return isWeekend(dayOfWeekToSampleDate(dayOfWeek));
}

/** Sanity check used only in tests/seed scripts - throws if the slot count
 * ever drifts from the fixed 16-per-day invariant. */
export function assertSlotsPerDay(n: number): void {
  if (n !== SLOTS_PER_DAY) {
    throw new RangeError(`expected ${SLOTS_PER_DAY} slots per day, got ${n}`);
  }
}
