/**
 * Availability is computed by this ONE function — used by the public page,
 * the admin panel and the JSON API. Never write a second implementation
 * (CLAUDE.md §4).
 *
 * RULE: this file imports nothing from next, react or @prisma/client. Plain
 * values in, plain values out. Callers (Server Components, Server Actions,
 * route handlers) fetch rows with Prisma and map them to the plain shapes
 * below before calling getDayAvailability.
 */
import {
  ALL_SLOT_INDEXES,
  hasSlotStarted,
  isMaintenanceSlot,
  slotEnd,
  slotLabel,
  slotStart,
  type SlotIndex,
  type SlotState,
  type SlotView,
} from './slots';

/** Plain mirror of the Prisma BookingStatus enum — kept local so this file
 *  never has to import @prisma/client just for a type. */
export type BookingStatusLike =
  | 'HELD'
  | 'CONFIRMED'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'EXPIRED'
  | 'NO_SHOW';

/** Statuses that occupy a slot. Matches the partial index in CLAUDE.md §2 —
 *  keep these two lists in sync. */
export const LIVE_BOOKING_STATUSES: readonly BookingStatusLike[] = [
  'HELD',
  'CONFIRMED',
  'COMPLETED',
];

export interface AvailabilityBooking {
  slotIndex: SlotIndex;
  status: BookingStatusLike;
}

export interface AvailabilitySlotRule {
  slotIndex: SlotIndex;
  isBookable: boolean;
  price: number;
}

export interface AvailabilityBlackout {
  /** null closes the entire day; a number closes just that slot. */
  slotIndex: SlotIndex | null;
}

export interface DayAvailabilityInput {
  /** The calendar day being rendered. */
  date: Date;
  /** Injected "current time" — never read from inside this file, so tests
   *  can pin it and callers can pass a UTC-correct value. */
  now: Date;
  /** This day's SlotRule rows (ideally all 16; a missing index is treated
   *  as not bookable). */
  slotRules: readonly AvailabilitySlotRule[];
  /** This day's Booking rows, any status — filtering to "live" happens
   *  inside this function. */
  bookings: readonly AvailabilityBooking[];
  /** This day's Blackout rows. */
  blackouts: readonly AvailabilityBlackout[];
}

/**
 * Renders all 16 slot positions for one day, always — a day must look the
 * same shape whatever is booked (CLAUDE.md §6).
 *
 * Check order matters and must not be reordered (CLAUDE.md §10):
 *   maintenance -> blackout -> booked -> past -> rule
 * because:
 *   - maintenance is fixed and wins over a blackout (else the 06:00 slot
 *     would merely read "blocked" instead of "maintenance").
 *   - a live booking wins over "past" (else a CONFIRMED/COMPLETED booking
 *     whose start time has passed would misleadingly read "past" instead
 *     of "booked").
 */
export function getDayAvailability(input: DayAvailabilityInput): SlotView[] {
  const { date, now, slotRules, bookings, blackouts } = input;

  const ruleByIndex = new Map<SlotIndex, AvailabilitySlotRule>(
    slotRules.map((rule) => [rule.slotIndex, rule]),
  );
  const liveBookingIndexes = new Set<SlotIndex>(
    bookings
      .filter((booking) => LIVE_BOOKING_STATUSES.includes(booking.status))
      .map((booking) => booking.slotIndex),
  );
  const wholeDayBlackedOut = blackouts.some((blackout) => blackout.slotIndex === null);
  const blackedOutIndexes = new Set<SlotIndex>(
    blackouts
      .filter((blackout): blackout is { slotIndex: SlotIndex } => blackout.slotIndex !== null)
      .map((blackout) => blackout.slotIndex),
  );

  function resolveState(index: SlotIndex): SlotState {
    if (isMaintenanceSlot(index)) return 'MAINTENANCE';
    if (wholeDayBlackedOut || blackedOutIndexes.has(index)) return 'BLOCKED';
    if (liveBookingIndexes.has(index)) return 'BOOKED';
    if (hasSlotStarted(date, index, now)) return 'PAST';
    const rule = ruleByIndex.get(index);
    if (!rule || !rule.isBookable) return 'BLOCKED';
    return 'AVAILABLE';
  }

  return ALL_SLOT_INDEXES.map((index) => {
    const state = resolveState(index);
    // resolveState only returns 'AVAILABLE' when a rule row exists (see the
    // "rule" step above), so the lookup below is never undefined here.
    const price = state === 'AVAILABLE' ? ruleByIndex.get(index)!.price : null;
    return {
      index,
      label: slotLabel(index),
      startsAt: slotStart(date, index),
      endsAt: slotEnd(date, index),
      state,
      price,
    } satisfies SlotView;
  });
}

/** Convenience: is this exact (date, slotIndex) currently bookable? Used by
 * the booking engine as a second, authoritative check right before the
 * transaction — see lib/booking-engine.ts. */
export function isSlotBookable(input: DayAvailabilityInput, index: SlotIndex): boolean {
  const day = getDayAvailability(input);
  const slot = day.find((s) => s.index === index);
  return slot?.state === 'AVAILABLE';
}
