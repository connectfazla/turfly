/**
 * BUILD_PLAN.md step 3: "Fire 20 simultaneous createBooking requests at the
 * same slot. Assert exactly 1 succeeds and 19 return SlotTakenError. Do not
 * mock the database."
 *
 * This test talks to the real local Postgres via the real Prisma client and
 * calls the real transactional createBooking() — no mocks, no stubs. The
 * guarantee under test is the partial unique index from CLAUDE.md §2:
 *   CREATE UNIQUE INDEX one_live_booking_per_slot ON "Booking" (date, "slotIndex")
 *   WHERE status IN ('HELD','CONFIRMED','COMPLETED');
 *
 * Run this live in the demo — see BUILD_PLAN.md's "Demo script" section.
 */
import { expect, test } from '@playwright/test';
import { createBooking, SlotTakenError } from '../lib/booking-engine';
import { prisma } from '../lib/prisma';

const CONCURRENCY = 20;
const TEST_SLOT_INDEX = 10; // an ordinary bookable slot, nowhere near maintenance (4)
const PHONE_PREFIX = '+8801900';

function testDate(): Date {
  // 10 days out — inside the 14-day booking window, guaranteed not to have
  // started, and stable for the lifetime of a single test run.
  const d = new Date();
  d.setDate(d.getDate() + 10);
  d.setHours(0, 0, 0, 0);
  return d;
}

async function cleanUp(date: Date) {
  await prisma.booking.deleteMany({ where: { date, slotIndex: TEST_SLOT_INDEX } });
  await prisma.customer.deleteMany({ where: { phone: { startsWith: PHONE_PREFIX } } });
}

test.describe('booking engine concurrency — the correctness core', () => {
  const date = testDate();

  test.beforeAll(async () => {
    await cleanUp(date);
  });

  test.afterAll(async () => {
    await cleanUp(date);
    await prisma.$disconnect();
  });

  test(`exactly 1 of ${CONCURRENCY} simultaneous createBooking calls at the same slot succeeds`, async () => {
    const now = new Date();

    const attempts = Array.from({ length: CONCURRENCY }, (_, i) =>
      createBooking({
        date,
        slotIndex: TEST_SLOT_INDEX,
        phone: `${PHONE_PREFIX}${String(i).padStart(3, '0')}`,
        fullName: `Concurrency Tester ${i}`,
        now,
      }),
    );

    const results = await Promise.allSettled(attempts);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    console.log(
      `[concurrency] ${fulfilled.length} succeeded, ${rejected.length} rejected out of ${CONCURRENCY}`,
    );

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(CONCURRENCY - 1);

    for (const r of rejected) {
      if (r.status !== 'rejected') continue;
      expect(r.reason).toBeInstanceOf(SlotTakenError);
    }

    // The database itself must agree: exactly one live row for this slot.
    const liveRows = await prisma.booking.findMany({
      where: {
        date,
        slotIndex: TEST_SLOT_INDEX,
        status: { in: ['HELD', 'CONFIRMED', 'COMPLETED'] },
      },
    });
    expect(liveRows).toHaveLength(1);
    expect(liveRows[0]!.status).toBe('CONFIRMED');
  });
});
