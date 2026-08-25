/**
 * BUILD_PLAN.md step 3: "Fire 20 simultaneous createBooking requests at the
 * same slot. Assert exactly 1 succeeds and 19 return SlotTakenError. Do not
 * mock the database."
 *
 * This test talks to the real local Postgres via the real Prisma client and
 * calls the real transactional createBooking() — no mocks, no stubs. The
 * guarantee under test is the partial unique index from CLAUDE.md §2, now
 * venue-scoped:
 *   CREATE UNIQUE INDEX one_live_booking_per_slot
 *     ON "Booking" ("venueId", date, "slotIndex")
 *     WHERE status IN ('HELD','CONFIRMED','COMPLETED','PENDING_VERIFICATION');
 *
 * Two properties, and BOTH matter — they pull in opposite directions, which
 * is the whole point of testing them together:
 *   1. within one venue, exactly one of N racing bookings wins;
 *   2. across two venues, the same (date, slotIndex) is bookable twice.
 * A too-narrow index breaks (1) and double-books. A too-wide one breaks (2)
 * and lets one turf's booking block an unrelated business's.
 *
 * Run this live in the demo — see BUILD_PLAN.md's "Demo script" section.
 */
import { expect, test } from '@playwright/test';
import { createBooking, SlotTakenError } from '../lib/booking-engine';
import { prisma } from '../lib/prisma';

/** Venue Zero. Resolved once in beforeAll rather than imported, so this
 * suite exercises the same rows the app does. */
let venueId: string;
/** The isolation fixture from scripts/create-test-venue.ts, when present.
 * The cross-venue test skips itself if it hasn't been created. */
let otherVenueId: string | null = null;

const CONCURRENCY = 20;
const TEST_SLOT_INDEX = 10; // an ordinary bookable slot, nowhere near maintenance (4)
const PHONE_PREFIX = '+8801900';

function testDate(): Date {
  // 10 days out — inside the 14-day booking window, guaranteed not to have
  // started, and stable for the lifetime of a single test run. Built as
  // UTC-midnight with today's LOCAL Y/M/D (see lib/availability-service.ts
  // dateOnly()) so this matches exactly what Prisma stores/queries for
  // Booking.date — otherwise the cleanup queries below would target the
  // wrong row in a positive-UTC-offset timezone (this app is fixed to
  // Asia/Dhaka, UTC+6).
  const local = new Date();
  local.setDate(local.getDate() + 10);
  return new Date(Date.UTC(local.getFullYear(), local.getMonth(), local.getDate()));
}

/**
 * @param venueIds Scoped to exactly the venues THIS suite created/knows
 *   about (Venue Zero + the optional isolation-test venue) — never an
 *   unscoped delete-by-date-and-slot across the whole platform. An earlier
 *   version had no venueId filter at all and silently deleted ANY venue's
 *   booking that happened to land on the same (date, slotIndex) — caught
 *   when it collided with scripts/create-demo-venue.ts's seeded data at the
 *   same coordinates and failed the FK check below instead of silently
 *   deleting someone else's booking, which is the only reason it was
 *   noticed. A test suite must never be able to touch a fixture it didn't
 *   create.
 */
async function cleanUp(date: Date, venueIds: string[]) {
  const where = { date, slotIndex: TEST_SLOT_INDEX, venueId: { in: venueIds } };
  // Payment.bookingId is RESTRICT, not CASCADE (prisma/schema.prisma) — a
  // booking with a payment attached refuses to delete until its Payment
  // rows are gone first. Bookings this suite creates never have one, but
  // deleting in FK-safe order costs nothing and makes cleanup robust
  // regardless of what ends up here.
  const ids = (await prisma.booking.findMany({ where, select: { id: true } })).map((b) => b.id);
  await prisma.payment.deleteMany({ where: { bookingId: { in: ids } } });
  await prisma.booking.deleteMany({ where });
  await prisma.customer.deleteMany({ where: { phone: { startsWith: PHONE_PREFIX } } });
}

test.describe('booking engine concurrency — the correctness core', () => {
  const date = testDate();

  test.beforeAll(async () => {
    const [zero, other] = await Promise.all([
      prisma.venue.findUnique({ where: { slug: 'default' }, select: { id: true } }),
      prisma.venue.findUnique({ where: { slug: 'test-venue' }, select: { id: true } }),
    ]);
    if (!zero) throw new Error('Venue Zero missing — run scripts/ensure-default-venue.ts');
    venueId = zero.id;
    otherVenueId = other?.id ?? null;
    await cleanUp(date, [venueId, otherVenueId].filter((v): v is string => v !== null));
  });

  test.afterAll(async () => {
    await cleanUp(date, [venueId, otherVenueId].filter((v): v is string => v !== null));
    await prisma.$disconnect();
  });

  test(`exactly 1 of ${CONCURRENCY} simultaneous createBooking calls at the same slot succeeds`, async () => {
    const now = new Date();

    const attempts = Array.from({ length: CONCURRENCY }, (_, i) =>
      createBooking({
        venueId,
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
    // venueId-scoped, same reasoning as cleanUp() above — an unscoped query
    // here would count another venue's unrelated booking at the same
    // (date, slotIndex) as if it were this test's own.
    const liveRows = await prisma.booking.findMany({
      where: {
        venueId,
        date,
        slotIndex: TEST_SLOT_INDEX,
        status: { in: ['HELD', 'CONFIRMED', 'COMPLETED'] },
      },
    });
    expect(liveRows).toHaveLength(1);
    expect(liveRows[0]!.status).toBe('CONFIRMED');
  });

  test('two venues can independently book the SAME (date, slotIndex)', async () => {
    test.skip(otherVenueId === null, 'needs scripts/create-test-venue.ts');
    const now = new Date();
    await cleanUp(date, [venueId, otherVenueId].filter((v): v is string => v !== null));

    // Same day, same slot, different venues. Both must succeed: these are
    // two unrelated businesses whose pitches have nothing to do with each
    // other. Before the index was venue-scoped, the second call here failed
    // with SlotTakenError — one turf's booking blocked another's.
    const first = await createBooking({
      venueId,
      date,
      slotIndex: TEST_SLOT_INDEX,
      phone: `${PHONE_PREFIX}900`,
      fullName: 'Venue Zero Customer',
      now,
    });
    const second = await createBooking({
      venueId: otherVenueId!,
      date,
      slotIndex: TEST_SLOT_INDEX,
      phone: `${PHONE_PREFIX}901`,
      fullName: 'Test Venue Customer',
      now,
    });

    expect(first.venueId).toBe(venueId);
    expect(second.venueId).toBe(otherVenueId);

    // References must be distinguishable per venue, not a shared sequence.
    expect(first.reference).not.toBe(second.reference);
    expect(first.reference).toMatch(/^TRF-[A-Z0-9]{2,8}-\d{4}-\d{4}$/);
    expect(second.reference).toMatch(/^TRF-[A-Z0-9]{2,8}-\d{4}-\d{4}$/);

    // ...and the slot really is doubly occupied, one row per venue.
    // venueId-scoped to just these two — a third venue (e.g. the seeded demo
    // venue) legitimately having its own live booking at the same
    // (date, slotIndex) is correct multi-tenancy, not a leak, and must not
    // fail this count. See cleanUp()'s doc comment for the same reasoning.
    const live = await prisma.booking.findMany({
      where: {
        date,
        slotIndex: TEST_SLOT_INDEX,
        status: { in: ['HELD', 'CONFIRMED', 'COMPLETED'] },
        venueId: { in: [venueId, otherVenueId!] },
      },
      select: { venueId: true },
    });
    expect(live).toHaveLength(2);
    expect(new Set(live.map((b) => b.venueId)).size).toBe(2);

    // But WITHIN one venue the guarantee still holds.
    await expect(
      createBooking({
        venueId,
        date,
        slotIndex: TEST_SLOT_INDEX,
        phone: `${PHONE_PREFIX}902`,
        fullName: 'Should Be Refused',
        now,
      }),
    ).rejects.toBeInstanceOf(SlotTakenError);
  });
});
