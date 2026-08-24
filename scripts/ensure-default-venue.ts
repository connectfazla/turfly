/**
 * IDEMPOTENT: makes sure "Tenant Zero" and its "Venue Zero" exist.
 *
 *   pnpm exec tsx scripts/ensure-default-venue.ts
 *
 * Replaces scripts/backfill-tenant-zero.ts, which did two things: create
 * Venue Zero, and backfill venueId onto every pre-multi-tenant row that
 * didn't have one. The second half is now structurally impossible —
 * Migration B made venueId NOT NULL on Booking / SlotRule / Blackout /
 * Payment, so there is no such thing as a row without one to fix up. Keeping
 * a script whose main body could never match a row would be worse than
 * deleting it, so what survives is just the "make sure the venue exists"
 * half, which prisma/seed.ts also calls directly.
 *
 * Useful standalone when pointing a fresh environment at an existing
 * database, or after a restore.
 */
import { PrismaClient } from '@prisma/client';
import { ensureDefaultVenue } from '../lib/provisioning';

const prisma = new PrismaClient();

async function main() {
  const before = await prisma.venue.findUnique({ where: { slug: 'default' }, select: { id: true } });
  const venueId = await ensureDefaultVenue(prisma);
  console.log(before ? `Venue Zero already exists (${venueId}).` : `Created Venue Zero (${venueId}).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
