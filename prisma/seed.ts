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
import { ALL_SLOT_INDEXES, MAINTENANCE_SLOT } from '../lib/slots';
import { ALL_DAYS_OF_WEEK, defaultSlotPrice } from '../lib/pricing';

const prisma = new PrismaClient();

const BCRYPT_COST = 12;

async function seedSlotRules() {
  let created = 0;
  for (const dayOfWeek of ALL_DAYS_OF_WEEK) {
    for (const slotIndex of ALL_SLOT_INDEXES) {
      await prisma.slotRule.upsert({
        where: { dayOfWeek_slotIndex: { dayOfWeek, slotIndex } },
        update: {},
        create: {
          dayOfWeek,
          slotIndex,
          isBookable: slotIndex !== MAINTENANCE_SLOT,
          price: defaultSlotPrice(dayOfWeek, slotIndex),
        },
      });
      created += 1;
    }
  }
  console.log(`  SlotRule: ${created} rows upserted (7 days x 16 slots)`);
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
