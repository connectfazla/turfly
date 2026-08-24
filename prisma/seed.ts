/**
 * Seeds: 112 SlotRule rows (7 days × 16 slots, slotIndex 4 unbookable on
 * every day), one ADMIN user, one MODERATOR user, a VenueSetting singleton,
 * and default pricing. Idempotent — safe to re-run.
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

async function seedVenueSetting() {
  await prisma.venueSetting.upsert({
    where: { id: 'singleton' },
    update: {},
    create: {
      id: 'singleton',
      venueName: 'Ortha Turf',
      contactPhone: '+8801700000000',
      contactEmail: 'hello@orthaturf.example',
      rulesText:
        'One 90-minute slot per booking. Please arrive 10 minutes early. ' +
        'Cancellations are free up to 6 hours before your slot.',
      holdMinutes: Number(process.env.HOLD_MINUTES ?? 10),
      cancellationWindowHours: Number(process.env.CANCELLATION_WINDOW_HOURS ?? 6),
      bookingWindowDays: Number(process.env.BOOKING_WINDOW_DAYS ?? 14),
    },
  });
  console.log('  VenueSetting: singleton row ready');
}

async function main() {
  console.log('Seeding...');
  await seedSlotRules();
  await seedUsers();
  await seedVenueSetting();
  console.log('Done.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
