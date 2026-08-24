/**
 * Seeds: 112 SlotRule rows (7 days × 16 slots, slotIndex 4 unbookable on
 * every day, with default pricing), one ADMIN user, one MODERATOR user.
 * Idempotent — safe to re-run.
 *
 * Does NOT create a Venue (that was VenueSetting's job pre-multi-tenant —
 * see prisma/schema.prisma's bottom note). On a fresh database, run
 * `tsx scripts/backfill-tenant-zero.ts` AFTER this script: it creates
 * "Venue Zero" and backfills venueId onto every SlotRule row this script
 * just created (and any Booking/Blackout/Payment/AuditLog rows, though a
 * fresh DB has none of those yet).
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { seedSlotRulesForVenue, SLOT_RULES_PER_VENUE } from '../lib/provisioning';
import { DEFAULT_VENUE_SLUG } from '../lib/tenant';

const prisma = new PrismaClient();

const BCRYPT_COST = 12;

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

async function seedUsers() {
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? 'Admin123!';
  const moderatorPassword = process.env.SEED_MODERATOR_PASSWORD ?? 'Moderator123!';

  const admin = await prisma.user.upsert({
    where: { email: 'admin@turf.local' },
    update: {},
    create: {
      email: 'admin@turf.local',
      name: 'Owner',
      role: 'ADMIN',
      passwordHash: await bcrypt.hash(adminPassword, BCRYPT_COST),
    },
  });

  const moderator = await prisma.user.upsert({
    where: { email: 'moderator@turf.local' },
    update: {},
    create: {
      email: 'moderator@turf.local',
      name: 'Counter Staff',
      role: 'MODERATOR',
      passwordHash: await bcrypt.hash(moderatorPassword, BCRYPT_COST),
    },
  });

  console.log(`  User: ${admin.email} (ADMIN), ${moderator.email} (MODERATOR)`);
  if (!process.env.SEED_ADMIN_PASSWORD) {
    console.log(
      `  Dev credentials — admin@turf.local / ${adminPassword}, moderator@turf.local / ${moderatorPassword} (set SEED_ADMIN_PASSWORD / SEED_MODERATOR_PASSWORD to override)`,
    );
  }
}

async function main() {
  console.log('Seeding...');
  await seedSlotRules();
  await seedUsers();
  console.log('Done. Run `tsx scripts/backfill-tenant-zero.ts` next to create the default Venue.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
