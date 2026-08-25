/**
 * BUILD_PLAN.md step 3: "Fire 20 simultaneous createBooking requests at the
 * same slot. Assert exactly 1 succeeds and 19 return SlotTakenError. Do not
 * mock the database."
 *
 * This test talks to the real local Postgres via the real Prisma client and
 * calls the real transactional createBooking() — no mocks, no stubs. The
 * guarantee under test is the partial unique index from CLAUDE.md §2, now
 * venue-AND-field-scoped (multi-field pass):
 *   CREATE UNIQUE INDEX one_live_booking_per_slot
 *     ON "Booking" ("venueId", "fieldId", date, "slotIndex")
 *     WHERE status IN ('HELD','CONFIRMED','COMPLETED','PENDING_VERIFICATION');
 *
 * Three properties, and ALL THREE matter — the first two pull in opposite
 * directions, and the third is the newest axis the index has to get right:
 *   1. within one field, exactly one of N racing bookings wins;
 *   2. across two venues, the same (date, slotIndex) is bookable twice;
 *   3. across two fields at the SAME venue, the same (date, slotIndex) is
 *      ALSO bookable twice — closing the badminton court must not close
 *      the football pitch.
 * A too-narrow index breaks (1) and double-books. A too-wide one breaks (2)
 * or (3) and lets one field's booking block an unrelated field's — whether
 * that field belongs to a different business or the same one.
 *
 * Run this live in the demo — see BUILD_PLAN.md's "Demo script" section.
 */
import { expect, test } from '@playwright/test';
import { createBooking, SlotTakenError } from '../lib/booking-engine';
import { seedSlotRulesForVenue } from '../lib/provisioning';
import { getDefaultFieldId } from '../lib/field';
import { prisma } from '../lib/prisma';

/** Venue Zero, and its default field. Resolved once in beforeAll rather
 * than imported, so this suite exercises the same rows the app does. */
let venueId: string;
let fieldId: string;
/** A throwaway SECOND field on Venue Zero, created by this suite alone —
 * property 3 needs two fields at one venue, and Venue Zero should not
 * permanently gain a second field just because a test file ran. */
let secondFieldId: string;
/** The isolation fixture from scripts/create-test-venue.ts, when present.
 * The cross-venue test skips itself if it hasn't been created. */
let otherVenueId: string | null = null;
let otherFieldId: string | null = null;

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
 *   create. venueId alone (not fieldId) is still the right scope here —
 *   this cleans up EVERY field's test bookings at these venues, which is
 *   exactly what's wanted between tests that use different fields.
 */
async function cleanUp(date: Date, venueIds: string[]) {
  const where = { date, slotIndex: TEST_SLOT_INDEX, venueId: { in: venueIds } };
  // Payment.bookingId is RESTRICT, not CASCADE (prisma/schema.prisma) — a
  // booking with a payment attached refuses to delete until its Payment
  // rows are gone first. Bookings this suite creates never have one, but
  // deleting in FK-safe order costs nothing and makes cleanup robust
  // regardless of what ends up here.
  const bookings = await prisma.booking.findMany({ where, select: { id: true, customerId: true } });
  const ids = bookings.map((b) => b.id);
  await prisma.payment.deleteMany({ where: { bookingId: { in: ids } } });
  await prisma.booking.deleteMany({ where });
  // Only the customers whose booking THIS call just deleted — not a blanket
  // phone-prefix wildcard. The multi-field test below calls cleanUp() with
  // a narrower venueIds list mid-suite (just Venue Zero, not the
  // isolation-fixture venue), and a customer from an earlier test can still
  // have a live booking at a venue outside that narrower scope; a wildcard
  // delete would try to remove that customer anyway and hit
  // Booking.customerId's RESTRICT FK. Deriving the exact customer ids from
  // the bookings actually being deleted is safe regardless of which subset
  // of venues a caller passes.
  const customerIds = [...new Set(bookings.map((b) => b.customerId))];
  await prisma.customer.deleteMany({ where: { id: { in: customerIds } } });
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
    fieldId = await getDefaultFieldId(prisma, venueId);
    otherVenueId = other?.id ?? null;
    otherFieldId = otherVenueId ? await getDefaultFieldId(prisma, otherVenueId) : null;

    // A throwaway second field on Venue Zero, for property 3 below. Its own
    // full SlotRule grid, same as any real field gets — createBooking reads
    // a real price from it, not a stub.
    const field = await prisma.field.create({
      data: { venueId, name: 'e2e Concurrency Fixture Field', sportName: 'Badminton' },
    });
    secondFieldId = field.id;
    await seedSlotRulesForVenue(prisma, venueId, secondFieldId);

    await cleanUp(date, [venueId, otherVenueId].filter((v): v is string => v !== null));
  });

  test.afterAll(async () => {
    await cleanUp(date, [venueId, otherVenueId].filter((v): v is string => v !== null));
    await prisma.slotRule.deleteMany({ where: { fieldId: secondFieldId } });
    await prisma.field.delete({ where: { id: secondFieldId } });
    await prisma.$disconnect();
  });

  test(`exactly 1 of ${CONCURRENCY} simultaneous createBooking calls at the same slot succeeds`, async () => {
    const now = new Date();

    const attempts = Array.from({ length: CONCURRENCY }, (_, i) =>
      createBooking({
        venueId,
        fieldId,
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
    // venueId+fieldId-scoped, same reasoning as cleanUp() above — an
    // unscoped query here would count another venue's, or another field's,
    // unrelated booking at the same (date, slotIndex) as if it were this
    // test's own.
    const liveRows = await prisma.booking.findMany({
      where: {
        venueId,
        fieldId,
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
      fieldId,
      date,
      slotIndex: TEST_SLOT_INDEX,
      phone: `${PHONE_PREFIX}900`,
      fullName: 'Venue Zero Customer',
      now,
    });
    const second = await createBooking({
      venueId: otherVenueId!,
      fieldId: otherFieldId!,
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

    // But WITHIN one venue+field the guarantee still holds.
    await expect(
      createBooking({
        venueId,
        fieldId,
        date,
        slotIndex: TEST_SLOT_INDEX,
        phone: `${PHONE_PREFIX}902`,
        fullName: 'Should Be Refused',
        now,
      }),
    ).rejects.toBeInstanceOf(SlotTakenError);
  });

  test('two fields at the SAME venue can independently book the same (date, slotIndex)', async () => {
    const now = new Date();
    await cleanUp(date, [venueId]);

    // Same day, same slot, same venue, different fields — the multi-field
    // pass's own headline guarantee. Before the index included fieldId,
    // this shape didn't exist at all: a venue had exactly one grid, so
    // there was no second field to test against.
    const first = await createBooking({
      venueId,
      fieldId,
      date,
      slotIndex: TEST_SLOT_INDEX,
      phone: `${PHONE_PREFIX}910`,
      fullName: 'Football Field Customer',
      now,
    });
    const second = await createBooking({
      venueId,
      fieldId: secondFieldId,
      date,
      slotIndex: TEST_SLOT_INDEX,
      phone: `${PHONE_PREFIX}911`,
      fullName: 'Badminton Court Customer',
      now,
    });

    expect(first.fieldId).toBe(fieldId);
    expect(second.fieldId).toBe(secondFieldId);
    // Same venue means the SAME reference sequence — venueId, not fieldId,
    // is what VenueReferenceCounter is keyed on (prisma/schema.prisma's
    // bottom note: no product reason to fragment references per field).
    expect(first.venueId).toBe(second.venueId);
    expect(first.reference).not.toBe(second.reference);

    const live = await prisma.booking.findMany({
      where: {
        venueId,
        date,
        slotIndex: TEST_SLOT_INDEX,
        status: { in: ['HELD', 'CONFIRMED', 'COMPLETED'] },
        fieldId: { in: [fieldId, secondFieldId] },
      },
      select: { fieldId: true },
    });
    expect(live).toHaveLength(2);
    expect(new Set(live.map((b) => b.fieldId)).size).toBe(2);

    // But WITHIN one field the guarantee still holds.
    await expect(
      createBooking({
        venueId,
        fieldId,
        date,
        slotIndex: TEST_SLOT_INDEX,
        phone: `${PHONE_PREFIX}912`,
        fullName: 'Should Be Refused',
        now,
      }),
    ).rejects.toBeInstanceOf(SlotTakenError);
  });
});
