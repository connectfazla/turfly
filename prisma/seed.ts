/**
 * Seeds 112 SlotRule rows (7 days × 16 slots, slotIndex 4 unbookable on
 * every day, with default pricing). Idempotent — safe to re-run.
 *
 * Deliberately seeds NO staff accounts. Authentication is Clerk's now, so
 * there is no password for this script to hash and no way to conjure a
 * Clerk identity from a seed script. On a fresh database the first staff
 * member is created by binding a real Clerk account:
 *
 *   OPERATOR_CLERK_USER_ID=user_xxx OPERATOR_EMAIL=you@example.com \
 *   pnpm exec tsx scripts/bind-operator-clerk-user.ts
 *
 * Does NOT create a Venue either (that was VenueSetting's job
 * pre-multi-tenant — see prisma/schema.prisma's bottom note). On a fresh
 * database run `tsx scripts/backfill-tenant-zero.ts` AFTER this script: it
 * creates "Venue Zero" and adopts the SlotRule rows seeded here.
 */
import { PrismaClient } from '@prisma/client';
import { seedSlotRulesForVenue, SLOT_RULES_PER_VENUE } from '../lib/provisioning';
import { DEFAULT_VENUE_SLUG } from '../lib/tenant';

const prisma = new PrismaClient();

async function seedSlotRules() {
  // The grid itself now lives in lib/provisioning.ts so the owner-onboarding
  // flow can seed a brand-new venue with the identical defaults. Attaches to
  // Venue Zero when it already exists (a re-run), otherwise leaves venueId
  // null for scripts/backfill-tenant-zero.ts to adopt — see that function's
  // doc comment for why null is tolerated here.
  const venueZero = await prisma.venue.findUnique({
    where: { slug: DEFAULT_VENUE_SLUG },
    select: { id: true },
  });
  const created = await seedSlotRulesForVenue(prisma, venueZero?.id ?? null);
  console.log(
    `  SlotRule: ${created} of ${SLOT_RULES_PER_VENUE} rows created (7 days x 16 slots)` +
      `${created === 0 ? ' — already seeded' : ''}`,
  );
}

async function main() {
  console.log('Seeding...');
  await seedSlotRules();
  console.log(
    'Done. Next: `tsx scripts/backfill-tenant-zero.ts` to create the default Venue,\n' +
      'then `tsx scripts/bind-operator-clerk-user.ts` to bind your Clerk account as owner.',
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
