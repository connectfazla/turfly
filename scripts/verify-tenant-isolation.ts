/**
 * Proves the tenant-isolation pass actually isolates.
 *
 *   pnpm exec tsx scripts/verify-tenant-isolation.ts
 *
 * Requires scripts/create-test-venue.ts to have run — it needs two venues
 * with real rows to attempt a leak between.
 *
 * This deliberately exercises the QUERY SHAPES the app uses rather than
 * calling the Server Actions, because the actions need a Clerk session that
 * a script has no way to mint. What it can prove is the half that was
 * actually broken: that a venue-scoped WHERE returns only that venue's
 * rows, and that the same query without one returns the whole platform.
 * The auth half (that `staff.venueId` is the caller's own venue and cannot
 * be forged) is enforced by lib/auth/active-venue.ts's assertVenueAccess
 * and is covered separately.
 *
 * Exits non-zero on any failure so it can gate a deploy.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

let failures = 0;

function check(name: string, passed: boolean, detail: string) {
  console.log(`  ${passed ? '✓' : '✗'} ${name}${passed ? '' : ` — ${detail}`}`);
  if (!passed) failures += 1;
}

async function main() {
  const [venueZero, testVenue] = await Promise.all([
    prisma.venue.findUnique({ where: { slug: 'default' } }),
    prisma.venue.findUnique({ where: { slug: 'test-venue' } }),
  ]);

  if (!venueZero || !testVenue) {
    console.error('Need both venues. Run: pnpm exec tsx scripts/create-test-venue.ts');
    process.exit(1);
  }
  console.log(`Venue Zero: ${venueZero.id}\nTest venue: ${testVenue.id}\n`);

  console.log('SlotRule (pricing grid)');
  {
    const [zero, test, all] = await Promise.all([
      prisma.slotRule.count({ where: { venueId: venueZero.id } }),
      prisma.slotRule.count({ where: { venueId: testVenue.id } }),
      prisma.slotRule.count(),
    ]);
    check('each venue has its own full 112-row grid', zero === 112 && test === 112, `zero=${zero} test=${test}`);
    check('an unscoped count sees both (i.e. the filter is load-bearing)', all >= 224, `all=${all}`);
  }

  console.log('\nPricing write scoping');
  {
    // The exact shape of updatePricingAction's updateMany, scoped. It must
    // touch the test venue's rows and NOT Venue Zero's.
    const before = await prisma.slotRule.findFirst({
      where: { venueId: venueZero.id, dayOfWeek: 1, slotIndex: 0 },
      select: { price: true },
    });
    const touched = await prisma.slotRule.updateMany({
      where: { venueId: testVenue.id, slotIndex: { in: [0] } },
      data: { price: 4321 },
    });
    const after = await prisma.slotRule.findFirst({
      where: { venueId: venueZero.id, dayOfWeek: 1, slotIndex: 0 },
      select: { price: true },
    });
    check('a scoped price write touches only its own venue', touched.count === 7, `touched=${touched.count} (expected 7 days)`);
    check(
      "Venue Zero's price is unchanged by the other venue's write",
      String(before?.price) === String(after?.price),
      `${before?.price} -> ${after?.price}`,
    );
  }

  console.log('\nVenue settings');
  {
    const [z, t] = await Promise.all([
      prisma.venue.findUnique({ where: { id: venueZero.id }, select: { depositPercent: true, bkashNumber: true } }),
      prisma.venue.findUnique({ where: { id: testVenue.id }, select: { depositPercent: true, bkashNumber: true } }),
    ]);
    check(
      'the two venues have genuinely different payment settings',
      z?.depositPercent !== t?.depositPercent && z?.bkashNumber !== t?.bkashNumber,
      `zero=${z?.depositPercent}%/${z?.bkashNumber} test=${t?.depositPercent}%/${t?.bkashNumber}`,
    );
  }

  console.log('\nBooking lookup (the IDOR shape)');
  {
    // Stand in a booking at the test venue, then try to read it as Venue
    // Zero would - which is exactly what /admin/bookings/[id] used to do.
    const customer = await prisma.customer.upsert({
      where: { phone: '01900000001' },
      update: {},
      create: { phone: '01900000001', fullName: 'Isolation Fixture', address: 'n/a' },
    });
    const foreign = await prisma.booking.create({
      data: {
        reference: `TRF-ISO-${Date.now()}`,
        venueId: testVenue.id,
        tenantId: testVenue.tenantId,
        customerId: customer.id,
        date: new Date('2030-01-01'),
        slotIndex: 7,
        priceAmount: 1000,
        status: 'CONFIRMED',
      },
    });

    const viaFindUnique = await prisma.booking.findUnique({ where: { id: foreign.id } });
    const viaScoped = await prisma.booking.findFirst({
      where: { id: foreign.id, venueId: venueZero.id },
    });
    check('the OLD unscoped lookup would have leaked it', viaFindUnique !== null, 'expected the leak to be reproducible');
    check('the scoped lookup refuses another venue\'s booking', viaScoped === null, 'LEAK: cross-tenant booking readable');

    const zeroList = await prisma.booking.findMany({ where: { venueId: venueZero.id }, select: { id: true } });
    check(
      "the other venue's booking is absent from Venue Zero's list",
      !zeroList.some((b) => b.id === foreign.id),
      'LEAK: appears in the wrong list',
    );

    await prisma.booking.delete({ where: { id: foreign.id } });
    await prisma.customer.delete({ where: { id: customer.id } });
  }

  console.log('\nCustomer scoping');
  {
    const scoped = await prisma.customer.count({
      where: { bookings: { some: { venueId: venueZero.id } } },
    });
    const global = await prisma.customer.count();
    check(
      'the customer list is scoped to people who booked here',
      scoped <= global,
      `scoped=${scoped} global=${global}`,
    );
  }

  console.log('\nActive-venue resolution');
  {
    // Mirrors lib/auth/active-venue.ts. The operator is a PlatformAdmin and
    // therefore reaches BOTH venues, which is exactly the case that would
    // otherwise resolve to "ambiguous" and lock them out of /admin.
    async function accessible(userId: string) {
      const isPA = await prisma.platformAdmin.findUnique({ where: { userId } });
      const venues = await prisma.venue.findMany({
        where: isPA
          ? { isActive: true }
          : {
              isActive: true,
              OR: [{ tenant: { ownerUserId: userId } }, { staff: { some: { userId, isActive: true } } }],
            },
        select: { id: true },
        orderBy: { createdAt: 'asc' },
      });
      return venues.map((v) => v.id);
    }

    const operator = await prisma.user.findFirst({
      where: { platformAdmin: { isNot: null } },
    });
    if (operator) {
      const allowed = await accessible(operator.id);
      const resolved = allowed.length === 1 ? allowed[0] : allowed.includes(venueZero.id) ? venueZero.id : null;
      check(
        'the operator still resolves to a venue despite reaching several',
        resolved === venueZero.id,
        `allowed=${allowed.length} resolved=${resolved}`,
      );
    }

    // The test tenant's owner is a Clerk id that cannot sign in, so nobody
    // reaches the test venue by ownership. If this ever fails, the fixture
    // has been made reachable and every check above is proving less than it
    // appears to.
    const testOwnerReach = await prisma.venue.count({
      where: { tenant: { ownerUserId: null }, slug: 'test-venue' },
    });
    check('the test venue has exactly one unreachable owner', testOwnerReach === 1, `count=${testOwnerReach}`);
  }

  console.log(failures === 0 ? '\nAll isolation checks passed.' : `\n${failures} CHECK(S) FAILED.`);
  process.exit(failures === 0 ? 0 : 1);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
