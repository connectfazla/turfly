/**
 * IDEMPOTENT: creates a second Tenant + Venue (+ its 112 SlotRule rows) so
 * tenant isolation can actually be tested.
 *
 *   pnpm exec tsx scripts/create-test-venue.ts
 *   pnpm exec tsx scripts/create-test-venue.ts --destroy
 *
 * WHY THIS EXISTS: every cross-tenant bug in this codebase is invisible
 * with one venue. A missing `venueId` filter returns exactly the right rows
 * when there is only one venue's worth of rows to return, so the test suite
 * and the browser both look fine right up until the day a second owner
 * signs up. This script manufactures the second tenant on demand, so
 * "does venue A leak into venue B" is a question that can be answered
 * before a real customer is the one asking it.
 *
 * The tenant it creates is deliberately owned by a Clerk user id that
 * cannot exist (`user_TESTVENUE...`), so no real signed-in person resolves
 * to OWNER on it. That matters: if it were owned by the operator, every
 * isolation check would pass trivially via the PlatformAdmin/owner path and
 * prove nothing.
 *
 * Safe against production data — it only ever touches rows belonging to the
 * venue whose slug is TEST_VENUE_SLUG, and --destroy refuses to run if any
 * booking exists under it.
 */
import { PrismaClient } from '@prisma/client';
import { seedSlotRulesForVenue, SLOT_RULES_PER_VENUE } from '../lib/provisioning';

const prisma = new PrismaClient();

const TEST_TENANT_NAME = 'Test Tenant (isolation fixture)';
const TEST_VENUE_SLUG = 'test-venue';
const TEST_VENUE_CODE = 'TSTV';
/** Intentionally not a real Clerk id — see the header comment. */
const TEST_OWNER_CLERK_ID = 'user_TESTVENUE000000000000000';

async function destroy() {
  const venue = await prisma.venue.findUnique({ where: { slug: TEST_VENUE_SLUG } });
  if (!venue) {
    console.log(`No venue with slug "${TEST_VENUE_SLUG}" — nothing to destroy.`);
    return;
  }

  const bookings = await prisma.booking.count({ where: { venueId: venue.id } });
  if (bookings > 0) {
    console.error(
      `Refusing to destroy: ${bookings} booking(s) exist under "${TEST_VENUE_SLUG}".\n` +
        'Delete them deliberately first if this really is throwaway data.',
    );
    process.exit(1);
  }

  await prisma.$transaction([
    prisma.slotRule.deleteMany({ where: { venueId: venue.id } }),
    prisma.blackout.deleteMany({ where: { venueId: venue.id } }),
    prisma.venueStaff.deleteMany({ where: { venueId: venue.id } }),
    prisma.auditLog.deleteMany({ where: { venueId: venue.id } }),
    prisma.venue.delete({ where: { id: venue.id } }),
    prisma.tenant.delete({ where: { id: venue.tenantId } }),
  ]);
  console.log(`Destroyed test venue "${TEST_VENUE_SLUG}" and its tenant.`);
}

async function create() {
  let venue = await prisma.venue.findUnique({ where: { slug: TEST_VENUE_SLUG } });

  if (!venue) {
    const tenant = await prisma.tenant.create({
      data: {
        name: TEST_TENANT_NAME,
        ownerClerkUserId: TEST_OWNER_CLERK_ID,
        ownerEmail: 'owner@test-venue.invalid',
      },
    });
    venue = await prisma.venue.create({
      data: {
        tenantId: tenant.id,
        slug: TEST_VENUE_SLUG,
        code: TEST_VENUE_CODE,
        name: 'Test Venue',
        contactPhone: '+8801800000000',
        contactEmail: 'hello@test-venue.invalid',
        rulesText: 'Isolation-test fixture. Not a real venue.',
        // Deliberately DIFFERENT from Venue Zero's defaults, so a page that
        // reads the wrong venue's settings shows a visibly wrong number
        // rather than a coincidentally identical one.
        depositPercent: 55,
        bkashNumber: '01999999999',
      },
    });
    console.log(`Created tenant ${tenant.id} and venue ${venue.id} (slug "${venue.slug}").`);
  } else {
    console.log(`Venue "${TEST_VENUE_SLUG}" already exists (${venue.id}) — reusing.`);
  }

  const created = await seedSlotRulesForVenue(prisma, venue.id);
  const total = await prisma.slotRule.count({ where: { venueId: venue.id } });
  console.log(`SlotRule: ${created} created this run, ${total}/${SLOT_RULES_PER_VENUE} total for this venue.`);

  console.log(
    `\nTest venue ready.\n` +
      `  venueId:      ${venue.id}\n` +
      `  tenantId:     ${venue.tenantId}\n` +
      `  depositPercent: ${venue.depositPercent}%  (Venue Zero's is different on purpose)\n` +
      `\nNobody can sign in as its owner by design. Tear down with --destroy.`,
  );
}

const run = process.argv.includes('--destroy') ? destroy : create;
run()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
