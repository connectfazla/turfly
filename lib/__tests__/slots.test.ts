import { describe, expect, it } from 'vitest';
import {
  ALL_SLOT_INDEXES,
  BOOKABLE_SLOT_INDEXES,
  MAINTENANCE_SLOT,
  MINUTES_PER_DAY,
  PEAK_SLOT_INDEXES,
  SLOT_MINUTES,
  SLOTS_PER_DAY,
  assertValidSlotIndex,
  currentSlotIndex,
  hasSlotStarted,
  isMaintenanceSlot,
  isPeakSlot,
  isValidSlotIndex,
  isWeekend,
  slotEnd,
  slotIndexFromTime,
  slotLabel,
  slotStart,
} from '../slots';

const DAY = new Date(2026, 7, 20); // a Thursday, arbitrary reference day

describe('constants', () => {
  it('1440 / 90 is exactly 16', () => {
    expect(MINUTES_PER_DAY / SLOT_MINUTES).toBe(SLOTS_PER_DAY);
    expect(SLOTS_PER_DAY).toBe(16);
  });

  it('ALL_SLOT_INDEXES is 0..15', () => {
    expect(ALL_SLOT_INDEXES).toEqual(Array.from({ length: 16 }, (_, i) => i));
  });

  it('BOOKABLE_SLOT_INDEXES excludes exactly the maintenance slot', () => {
    expect(BOOKABLE_SLOT_INDEXES).toHaveLength(15);
    expect(BOOKABLE_SLOT_INDEXES).not.toContain(MAINTENANCE_SLOT);
  });
});

describe('isValidSlotIndex / assertValidSlotIndex', () => {
  it.each([0, 1, 8, 15])('accepts in-range integer %i', (i) => {
    expect(isValidSlotIndex(i)).toBe(true);
    expect(() => assertValidSlotIndex(i)).not.toThrow();
  });

  it.each([-1, 16, 1.5, NaN, Infinity])('rejects out-of-range/non-integer %s', (i) => {
    expect(isValidSlotIndex(i)).toBe(false);
    expect(() => assertValidSlotIndex(i)).toThrow(RangeError);
  });
});

describe('isMaintenanceSlot', () => {
  it('is true only for index 4', () => {
    for (const i of ALL_SLOT_INDEXES) {
      expect(isMaintenanceSlot(i)).toBe(i === 4);
    }
  });
});

describe('slotStart / slotEnd', () => {
  it('index 0 starts at midnight', () => {
    const start = slotStart(DAY, 0);
    expect(start.getHours()).toBe(0);
    expect(start.getMinutes()).toBe(0);
  });

  it('index 4 (maintenance) starts at 06:00 and ends at 07:30', () => {
    expect(slotStart(DAY, 4).getHours()).toBe(6);
    expect(slotStart(DAY, 4).getMinutes()).toBe(0);
    expect(slotEnd(DAY, 4).getHours()).toBe(7);
    expect(slotEnd(DAY, 4).getMinutes()).toBe(30);
  });

  it('each slot is exactly 90 minutes long', () => {
    for (const i of ALL_SLOT_INDEXES) {
      const diffMs = slotEnd(DAY, i).getTime() - slotStart(DAY, i).getTime();
      expect(diffMs).toBe(SLOT_MINUTES * 60_000);
    }
  });

  it('consecutive slots are contiguous, no gap or overlap', () => {
    for (let i = 0; i < SLOTS_PER_DAY - 1; i++) {
      expect(slotEnd(DAY, i).getTime()).toBe(slotStart(DAY, i + 1).getTime());
    }
  });

  it('slotStart throws for an invalid index', () => {
    expect(() => slotStart(DAY, 16)).toThrow(RangeError);
  });

  it('is pinned to the given date, ignoring any pre-existing time component', () => {
    const withTime = new Date(2026, 7, 20, 13, 45, 0);
    expect(slotStart(withTime, 0).getHours()).toBe(0);
  });
});

describe('slotLabel — the slot-15 trap', () => {
  it('slot 15 reads "22:30 – 00:00", never "22:30 – 24:00"', () => {
    expect(slotLabel(15)).toBe('22:30 – 00:00');
  });

  it('slot 0 reads "00:00 – 01:30"', () => {
    expect(slotLabel(0)).toBe('00:00 – 01:30');
  });

  it('slot 4 (maintenance) reads "06:00 – 07:30"', () => {
    expect(slotLabel(4)).toBe('06:00 – 07:30');
  });

  it('every label matches the HH:MM – HH:MM shape', () => {
    for (const i of ALL_SLOT_INDEXES) {
      expect(slotLabel(i)).toMatch(/^\d{2}:\d{2} – \d{2}:\d{2}$/);
    }
  });

  it('throws for an invalid index', () => {
    expect(() => slotLabel(-1)).toThrow(RangeError);
  });
});

describe('slotIndexFromTime', () => {
  it('returns the slot index for an exact boundary', () => {
    expect(slotIndexFromTime(new Date(2026, 7, 20, 0, 0))).toBe(0);
    expect(slotIndexFromTime(new Date(2026, 7, 20, 6, 0))).toBe(4);
    expect(slotIndexFromTime(new Date(2026, 7, 20, 22, 30))).toBe(15);
  });

  it('returns null for a time not on a 90-minute boundary', () => {
    expect(slotIndexFromTime(new Date(2026, 7, 20, 6, 15))).toBeNull();
  });
});

describe('currentSlotIndex', () => {
  it('is always defined — the venue never closes', () => {
    for (let h = 0; h < 24; h++) {
      const idx = currentSlotIndex(new Date(2026, 7, 20, h, 0));
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThan(SLOTS_PER_DAY);
    }
  });

  it('06:45 falls inside slot 4 (maintenance)', () => {
    expect(currentSlotIndex(new Date(2026, 7, 20, 6, 45))).toBe(4);
  });

  it('23:59 falls inside slot 15', () => {
    expect(currentSlotIndex(new Date(2026, 7, 20, 23, 59))).toBe(15);
  });
});

describe('hasSlotStarted', () => {
  it('a slot later today has not started', () => {
    const now = new Date(2026, 7, 20, 10, 0);
    expect(hasSlotStarted(DAY, 14, now)).toBe(false); // 21:00 slot
  });

  it('a slot earlier today has started', () => {
    const now = new Date(2026, 7, 20, 10, 0);
    expect(hasSlotStarted(DAY, 2, now)).toBe(true); // 03:00 slot
  });

  it('the exact boundary counts as started', () => {
    const now = slotStart(DAY, 5);
    expect(hasSlotStarted(DAY, 5, now)).toBe(true);
  });

  it('the same slot index on a future day has not started', () => {
    const now = new Date(2026, 7, 20, 10, 0);
    const tomorrow = new Date(2026, 7, 21);
    expect(hasSlotStarted(tomorrow, 2, now)).toBe(false); // same index 2, different day
  });
});

describe('isPeakSlot', () => {
  it('matches exactly 16:30, 18:00, 19:30, 21:00', () => {
    expect(PEAK_SLOT_INDEXES).toEqual([11, 12, 13, 14]);
    for (const i of ALL_SLOT_INDEXES) {
      expect(isPeakSlot(i)).toBe(PEAK_SLOT_INDEXES.includes(i));
    }
  });
});

describe('isWeekend', () => {
  it('Friday and Saturday are weekend', () => {
    // 2026-08-21 is a Friday, 2026-08-22 a Saturday.
    expect(isWeekend(new Date(2026, 7, 21))).toBe(true);
    expect(isWeekend(new Date(2026, 7, 22))).toBe(true);
  });

  it('every other day is not weekend', () => {
    // 2026-08-16 (Sun) .. 2026-08-20 (Thu)
    for (let d = 16; d <= 20; d++) {
      expect(isWeekend(new Date(2026, 7, d))).toBe(false);
    }
  });
});
