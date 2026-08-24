/**
 * Pure slot arithmetic. The correctness core of the whole system.
 *
 * RULE: this file imports nothing from next, react or @prisma/client.
 * Plain values in, plain values out. That is what makes it exhaustively
 * unit-testable, and the test suite is the evidence that the system is correct.
 *
 * 1440 minutes / 90 = 16 exactly, so a slot is fully described by an integer.
 */

export const SLOT_MINUTES = 90;
export const SLOTS_PER_DAY = 16; // 1440 / 90
export const MAINTENANCE_SLOT = 4; // 06:00 – 07:30, closed every day
export const MINUTES_PER_DAY = 1440;

export type SlotIndex = number; // 0..15

export type SlotState =
  | 'AVAILABLE'
  | 'BOOKED'
  | 'BLOCKED'
  | 'MAINTENANCE'
  | 'PAST';

export interface SlotView {
  index: SlotIndex;
  label: string; // "19:30 – 21:00"
  startsAt: Date;
  endsAt: Date;
  state: SlotState;
  price: number | null; // null unless AVAILABLE
}

// ---------------------------------------------------------------- guards

/** True for any integer 0..15. The one guard every other function in this
 * file relies on before doing arithmetic with a slot index. */
export function isValidSlotIndex(index: number): boolean {
  return Number.isInteger(index) && index >= 0 && index < SLOTS_PER_DAY;
}

/** Throws RangeError for anything isValidSlotIndex() would reject. Narrows
 * the type to SlotIndex for the rest of the calling function. */
export function assertValidSlotIndex(index: number): asserts index is SlotIndex {
  if (!isValidSlotIndex(index)) {
    throw new RangeError(
      `slotIndex must be an integer 0..${SLOTS_PER_DAY - 1}, received ${index}`,
    );
  }
}

/** Maintenance is also encoded in SlotRule data; this is the belt to that braces. */
export function isMaintenanceSlot(index: SlotIndex): boolean {
  return index === MAINTENANCE_SLOT;
}

// ---------------------------------------------------------------- time

/** Zeroes out the time-of-day, keeping the local calendar date. */
function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** The instant a slot begins: local midnight of `date`, plus index * 90
 * minutes. This is the arithmetic every other time-based function here
 * (slotEnd, hasSlotStarted, currentSlotIndex's callers) is built on. */
export function slotStart(date: Date, index: SlotIndex): Date {
  assertValidSlotIndex(index);
  const d = startOfDay(date);
  d.setMinutes(d.getMinutes() + index * SLOT_MINUTES);
  return d;
}

/** The instant a slot ends: exactly 90 minutes after slotStart. For slot
 * 15 this is local midnight of the NEXT calendar day. */
export function slotEnd(date: Date, index: SlotIndex): Date {
  const d = slotStart(date, index);
  d.setMinutes(d.getMinutes() + SLOT_MINUTES);
  return d;
}

/**
 * TRAP: slot 15 runs 22:30 → 00:00 the NEXT day.
 * Label it "22:30 – 00:00", never "22:30 – 24:00". There is a test for this.
 */
export function slotLabel(index: SlotIndex): string {
  assertValidSlotIndex(index);
  const from = index * SLOT_MINUTES;
  const to = (from + SLOT_MINUTES) % MINUTES_PER_DAY;
  return `${hhmm(from)} – ${hhmm(to)}`;
}

/** 0 -> "00:00", 90 -> "01:30", etc. Zero-padded 24-hour clock, no am/pm. */
function hhmm(minutesFromMidnight: number): string {
  const h = Math.floor(minutesFromMidnight / 60);
  const m = minutesFromMidnight % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Inverse of slotStart. Returns null if the time is not on a slot boundary. */
export function slotIndexFromTime(date: Date): SlotIndex | null {
  const mins = date.getHours() * 60 + date.getMinutes();
  if (mins % SLOT_MINUTES !== 0) return null;
  return mins / SLOT_MINUTES;
}

/** The slot currently in progress at `now`. Always defined — the venue never closes. */
export function currentSlotIndex(now: Date): SlotIndex {
  const mins = now.getHours() * 60 + now.getMinutes();
  return Math.floor(mins / SLOT_MINUTES);
}

/** CLAUDE.md §2 invariant 4: a slot whose start time has passed cannot be
 * booked. The boundary itself counts as started (>=, not >). */
export function hasSlotStarted(date: Date, index: SlotIndex, now: Date): boolean {
  return slotStart(date, index).getTime() <= now.getTime();
}

// ---------------------------------------------------------------- iteration

export const ALL_SLOT_INDEXES: readonly SlotIndex[] = Object.freeze(
  Array.from({ length: SLOTS_PER_DAY }, (_, i) => i),
);

/** The 15 that can ever be sold. Slot 4 is permanently excluded. */
export const BOOKABLE_SLOT_INDEXES: readonly SlotIndex[] = Object.freeze(
  ALL_SLOT_INDEXES.filter((i) => !isMaintenanceSlot(i)),
);

// ---------------------------------------------------------------- pricing helper

/** Evening peak window: 16:30, 18:00, 19:30, 21:00. The "night" price tier. */
export const PEAK_SLOT_INDEXES: readonly SlotIndex[] = Object.freeze([11, 12, 13, 14]);

export function isPeakSlot(index: SlotIndex): boolean {
  return PEAK_SLOT_INDEXES.includes(index);
}

/** Midday window: 09:00, 10:30, 12:00, 13:30 (slot start times) — i.e.
 * 09:00–15:00. The cheapest "noon" price tier, same price every day of
 * the week (see lib/pricing.ts). Every other bookable, non-peak slot
 * (very early morning + late evening/night) falls into the remaining
 * "afternoon" tier, priced per weekday/weekend like the peak tier. */
export const NOON_SLOT_INDEXES: readonly SlotIndex[] = Object.freeze([6, 7, 8, 9]);

export function isNoonSlot(index: SlotIndex): boolean {
  return NOON_SLOT_INDEXES.includes(index);
}

/** Friday and Saturday are the Bangladesh weekend, not Saturday/Sunday. */
export function isWeekend(date: Date): boolean {
  const d = date.getDay(); // 0 Sun … 6 Sat
  return d === 5 || d === 6; // Fri–Sat weekend. CHANGE THIS if your venue differs.
}
