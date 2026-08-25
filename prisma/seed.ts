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
 * Creates "Venue Zero" (and its Tenant Zero) first, then its price grid —
 * that ordering is forced by SlotRule.venueId being NOT NULL.
 */
import { PrismaClient } from '@prisma/client';
import { ensureDefaultVenue, ensureDefaultField, seedSlotRulesForVenue, SLOT_RULES_PER_VENUE } from '../lib/provisioning';

const prisma = new PrismaClient();

async function seedSlotRules(venueId: string, fieldId: string) {
  // The grid itself lives in lib/provisioning.ts so the owner-onboarding flow
  // seeds a brand-new venue with the identical defaults.
  const created = await seedSlotRulesForVenue(prisma, venueId, fieldId);
  console.log(
    `  SlotRule: ${created} of ${SLOT_RULES_PER_VENUE} rows created (7 days x 16 slots)` +
      `${created === 0 ? ' — already seeded' : ''}`,
  );
}

async function main() {
  console.log('Seeding...');
  // Venue first: SlotRule.venueId is NOT NULL as of Migration B, so there
  // has to be a venue for the rules to belong to before they can exist.
  // Field second: SlotRule.fieldId is NOT NULL as of the multi-field pass,
  // same ordering constraint one level down.
  const venueId = await ensureDefaultVenue(prisma);
  console.log(`  Venue: ${venueId} (slug "default")`);
  const fieldId = await ensureDefaultField(prisma, venueId, 'Turfly');
  console.log(`  Field: ${fieldId}`);
  await seedSlotRules(venueId, fieldId);
  console.log(
    'Done. Next: `tsx scripts/bind-operator-clerk-user.ts` to bind your Clerk\n' +
      'account as platform admin and owner of this venue.',
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
