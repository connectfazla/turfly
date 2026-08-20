import { describe, expect, it } from 'vitest';
import {
  getDayAvailability,
  isSlotBookable,
  type AvailabilityBlackout,
  type AvailabilityBooking,
  type AvailabilitySlotRule,
  type DayAvailabilityInput,
} from '../availability';
import { ALL_SLOT_INDEXES, MAINTENANCE_SLOT, SLOTS_PER_DAY } from '../slots';

const DAY = new Date(2026, 7, 20); // Thursday
const TOMORROW = new Date(2026, 7, 21);

/** Full 16-row rule set: everything bookable at 1200 except the maintenance
 * slot, mirroring what prisma/seed.ts actually seeds. */
function fullRuleSet(overrides: Partial<Record<number, AvailabilitySlotRule>> = {}) {
  return ALL_SLOT_INDEXES.map(
    (slotIndex): AvailabilitySlotRule =>
      overrides[slotIndex] ?? {
        slotIndex,
        isBookable: slotIndex !== MAINTENANCE_SLOT,
        price: slotIndex === MAINTENANCE_SLOT ? 0 : 1200,
      },
  );
}

function baseInput(overrides: Partial<DayAvailabilityInput> = {}): DayAvailabilityInput {
  return {
    date: DAY,
    now: new Date(2026, 7, 20, 0, 0), // midnight — nothing has "started" yet
    slotRules: fullRuleSet(),
    bookings: [],
    blackouts: [],
    ...overrides,
  };
}

describe('getDayAvailability — shape', () => {
  it('always renders exactly 16 positions, indexes 0..15 in order', () => {
    const result = getDayAvailability(baseInput());
    expect(result).toHaveLength(SLOTS_PER_DAY);
    expect(result.map((s) => s.index)).toEqual(ALL_SLOT_INDEXES);
  });

  it('renders 16 positions even with zero rules, zero bookings, zero blackouts', () => {
    const result = getDayAvailability(baseInput({ slotRules: [], bookings: [], blackouts: [] }));
    expect(result).toHaveLength(SLOTS_PER_DAY);
  });
});

describe('maintenance — belt and braces', () => {
  it('slot 4 is MAINTENANCE regardless of what SlotRule says', () => {
    const result = getDayAvailability(
      baseInput({
        // A bad rule row claiming the maintenance slot is bookable — the
        // hard-coded isMaintenanceSlot() check must win anyway.
        slotRules: fullRuleSet({ [MAINTENANCE_SLOT]: { slotIndex: 4, isBookable: true, price: 999 } }),
      }),
    );
    const slot4 = result.find((s) => s.index === MAINTENANCE_SLOT)!;
    expect(slot4.state).toBe('MAINTENANCE');
    expect(slot4.price).toBeNull();
  });

  it('slot 4 is MAINTENANCE on every day of week seed data (0..6)', () => {
    for (let dow = 0; dow < 7; dow++) {
      const d = new Date(2026, 7, 16 + dow); // 2026-08-16 was a Sunday (dow 0)
      const result = getDayAvailability(baseInput({ date: d }));
      expect(result.find((s) => s.index === MAINTENANCE_SLOT)!.state).toBe('MAINTENANCE');
    }
  });
});

describe('blackout', () => {
  it('a whole-day blackout (slotIndex null) closes all 15 bookable slots as BLOCKED', () => {
    const blackouts: AvailabilityBlackout[] = [{ slotIndex: null }];
    const result = getDayAvailability(baseInput({ blackouts }));
    for (const slot of result) {
      if (slot.index === MAINTENANCE_SLOT) continue;
      expect(slot.state).toBe('BLOCKED');
      expect(slot.price).toBeNull();
    }
  });

  it('a whole-day blackout does NOT downgrade the maintenance slot to merely "blocked"', () => {
    const blackouts: AvailabilityBlackout[] = [{ slotIndex: null }];
    const result = getDayAvailability(baseInput({ blackouts }));
    expect(result.find((s) => s.index === MAINTENANCE_SLOT)!.state).toBe('MAINTENANCE');
  });

  it('a single-slot blackout closes only that slot', () => {
    const blackouts: AvailabilityBlackout[] = [{ slotIndex: 7 }];
    const result = getDayAvailability(baseInput({ blackouts }));
    expect(result.find((s) => s.index === 7)!.state).toBe('BLOCKED');
    expect(result.find((s) => s.index === 8)!.state).toBe('AVAILABLE');
  });
});

describe('booked — and the "booked beats past" ordering trap', () => {
  it('a live booking marks its slot BOOKED with no price', () => {
    const bookings: AvailabilityBooking[] = [{ slotIndex: 10, status: 'CONFIRMED' }];
    const result = getDayAvailability(baseInput({ bookings }));
    const slot = result.find((s) => s.index === 10)!;
    expect(slot.state).toBe('BOOKED');
    expect(slot.price).toBeNull();
  });

  it.each(['HELD', 'CONFIRMED', 'COMPLETED'] as const)(
    '%s bookings occupy the slot (live statuses)',
    (status) => {
      const result = getDayAvailability(baseInput({ bookings: [{ slotIndex: 9, status }] }));
      expect(result.find((s) => s.index === 9)!.state).toBe('BOOKED');
    },
  );

  it.each(['CANCELLED', 'EXPIRED', 'NO_SHOW'] as const)(
    '%s bookings do NOT occupy the slot',
    (status) => {
      const result = getDayAvailability(baseInput({ bookings: [{ slotIndex: 9, status }] }));
      expect(result.find((s) => s.index === 9)!.state).toBe('AVAILABLE');
    },
  );

  it('a CONFIRMED booking whose slot start has already passed still reads BOOKED, never PAST', () => {
    // now is late in the day; slot 2 (03:00) is long past, but it's booked.
    const now = new Date(2026, 7, 20, 23, 0);
    const bookings: AvailabilityBooking[] = [{ slotIndex: 2, status: 'COMPLETED' }];
    const result = getDayAvailability(baseInput({ now, bookings }));
    expect(result.find((s) => s.index === 2)!.state).toBe('BOOKED');
  });
});

describe('past — excluded today, not tomorrow', () => {
  it('a slot whose start time has passed today is PAST', () => {
    const now = new Date(2026, 7, 20, 10, 0); // 10:00
    const result = getDayAvailability(baseInput({ now, date: DAY }));
    expect(result.find((s) => s.index === 2)!.state).toBe('PAST'); // 03:00 slot
  });

  it('the same slot index tomorrow is NOT past', () => {
    const now = new Date(2026, 7, 20, 10, 0);
    const result = getDayAvailability(baseInput({ now, date: TOMORROW }));
    expect(result.find((s) => s.index === 2)!.state).toBe('AVAILABLE');
  });

  it('a PAST slot carries no price', () => {
    const now = new Date(2026, 7, 20, 10, 0);
    const result = getDayAvailability(baseInput({ now, date: DAY }));
    expect(result.find((s) => s.index === 2)!.price).toBeNull();
  });
});

describe('rule', () => {
  it('AVAILABLE slot carries the price from its SlotRule', () => {
    const result = getDayAvailability(baseInput());
    const slot = result.find((s) => s.index === 8)!;
    expect(slot.state).toBe('AVAILABLE');
    expect(slot.price).toBe(1200);
  });

  it('SlotRule.isBookable = false blocks a non-maintenance slot', () => {
    const result = getDayAvailability(
      baseInput({ slotRules: fullRuleSet({ 6: { slotIndex: 6, isBookable: false, price: 1200 } }) }),
    );
    const slot = result.find((s) => s.index === 6)!;
    expect(slot.state).toBe('BLOCKED');
    expect(slot.price).toBeNull();
  });

  it('a missing SlotRule row defaults to BLOCKED, not AVAILABLE', () => {
    // now is pinned to the day before, so no slot on DAY has "started" yet —
    // isolates the rule-fallback behaviour from the past-slot check.
    const result = getDayAvailability(
      baseInput({ slotRules: [], now: new Date(2026, 7, 19, 0, 0) }),
    );
    for (const slot of result) {
      if (slot.index === MAINTENANCE_SLOT) continue;
      expect(slot.state).toBe('BLOCKED');
    }
  });
});

describe('check order — full precedence chain (CLAUDE.md §10)', () => {
  it('maintenance beats blackout, booked, past and rule simultaneously', () => {
    const result = getDayAvailability(
      baseInput({
        now: new Date(2026, 7, 20, 23, 0),
        blackouts: [{ slotIndex: null }],
        bookings: [{ slotIndex: MAINTENANCE_SLOT, status: 'CONFIRMED' }],
        slotRules: fullRuleSet({ [MAINTENANCE_SLOT]: { slotIndex: 4, isBookable: true, price: 500 } }),
      }),
    );
    expect(result.find((s) => s.index === MAINTENANCE_SLOT)!.state).toBe('MAINTENANCE');
  });

  it('blackout beats booked and past for a non-maintenance slot', () => {
    const result = getDayAvailability(
      baseInput({
        now: new Date(2026, 7, 20, 23, 0),
        blackouts: [{ slotIndex: 3 }],
        bookings: [{ slotIndex: 3, status: 'CONFIRMED' }],
      }),
    );
    expect(result.find((s) => s.index === 3)!.state).toBe('BLOCKED');
  });

  it('booked beats past for a non-maintenance slot', () => {
    const result = getDayAvailability(
      baseInput({
        now: new Date(2026, 7, 20, 23, 0),
        bookings: [{ slotIndex: 3, status: 'CONFIRMED' }],
      }),
    );
    expect(result.find((s) => s.index === 3)!.state).toBe('BOOKED');
  });
});

describe('isSlotBookable', () => {
  it('true for an AVAILABLE slot', () => {
    expect(isSlotBookable(baseInput(), 8)).toBe(true);
  });

  it('false for a BOOKED slot', () => {
    const input = baseInput({ bookings: [{ slotIndex: 8, status: 'CONFIRMED' }] });
    expect(isSlotBookable(input, 8)).toBe(false);
  });

  it('false for the maintenance slot', () => {
    expect(isSlotBookable(baseInput(), MAINTENANCE_SLOT)).toBe(false);
  });

  it('false for a PAST slot', () => {
    const input = baseInput({ now: new Date(2026, 7, 20, 10, 0) });
    expect(isSlotBookable(input, 2)).toBe(false);
  });
});
