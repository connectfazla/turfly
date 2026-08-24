/**
 * Everything needed to stand up a brand-new Venue's data. Shared by
 * prisma/seed.ts (which provisions the development database) and, from
 * Stage 7 onward, the owner-onboarding flow that provisions a real tenant's
 * first venue.
 *
 * Lives in lib/ rather than prisma/ specifically so the onboarding Server
 * Action can import it — prisma/seed.ts is a standalone script and is not
 * part of the app's module graph.
 */
import type { Prisma, PrismaClient } from '@prisma/client';
import { ALL_SLOT_INDEXES, MAINTENANCE_SLOT } from './slots';
import { ALL_DAYS_OF_WEEK, defaultSlotPrice } from './pricing';

/** Accepts either the client or a transaction handle, so this can run
 * inside onboarding's single provisioning transaction. */
type Db = PrismaClient | Prisma.TransactionClient;

/** 7 weekdays x 16 slots. Every venue starts with exactly this many rows. */
export const SLOT_RULES_PER_VENUE = ALL_DAYS_OF_WEEK.length * ALL_SLOT_INDEXES.length;

/**
 * Seeds a venue's full default price grid.
 *
 * ONE `createMany`, not 112 sequential upserts. The old seed did the
 * latter, which is ~112 round trips — tolerable for a one-off script
 * against a local database, but far too slow to sit inside onboarding's
 * provisioning transaction against Neon (where per-query latency is what
 * forced runSerializable's timeout up to 15s in the first place). At one
 * statement it comfortably fits.
 *
 * `skipDuplicates` keeps this idempotent, standing in for the upsert's
 * `update: {}`: re-running never disturbs prices an owner has since edited.
 * It relies on the (venueId, dayOfWeek, slotIndex) unique constraint, so
 * before Migration B — while that constraint is still the venue-less
 * (dayOfWeek, slotIndex) — a second venue's rules would collide. Seeding a
 * second venue is therefore a Stage 3+ operation, which is exactly when
 * scripts/create-test-venue.ts arrives.
 *
 * slotIndex 4 is seeded isBookable=false on EVERY day — this is how the
 * maintenance window stays data rather than a hard-coded condition.
 *
 * `venueId` accepts null for exactly one caller: prisma/seed.ts on a fresh
 * database, which runs BEFORE scripts/backfill-tenant-zero.ts has created
 * Venue Zero and therefore has no venue to attach rules to yet. The backfill
 * adopts those rows immediately afterward. Once Migration B makes
 * SlotRule.venueId NOT NULL that bootstrap ordering has to be inverted (seed
 * creates the venue first), and this parameter narrows back to `string`.
 */
export async function seedSlotRulesForVenue(db: Db, venueId: string | null): Promise<number> {
  const rows = ALL_DAYS_OF_WEEK.flatMap((dayOfWeek) =>
    ALL_SLOT_INDEXES.map((slotIndex) => ({
      venueId,
      dayOfWeek,
      slotIndex,
      isBookable: slotIndex !== MAINTENANCE_SLOT,
      price: defaultSlotPrice(dayOfWeek, slotIndex),
    })),
  );

  const result = await db.slotRule.createMany({ data: rows, skipDuplicates: true });
  return result.count;
}
