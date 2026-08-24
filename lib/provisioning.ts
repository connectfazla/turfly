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
 * It relies on the (venueId, dayOfWeek, slotIndex) unique constraint.
 *
 * slotIndex 4 is seeded isBookable=false on EVERY day — this is how the
 * maintenance window stays data rather than a hard-coded condition.
 */
export async function seedSlotRulesForVenue(db: Db, venueId: string): Promise<number> {
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

/** Matches lib/tenant.ts's DEFAULT_VENUE_SLUG. */
const VENUE_ZERO_SLUG = 'default';

/**
 * IDEMPOTENT: makes sure "Tenant Zero" and its "Venue Zero" exist, and
 * returns the venue's id.
 *
 * Venue Zero is the pre-SaaS physical venue — it predates onboarding, so it
 * has no Clerk Organization and its tenant's clerkOrgId stays null until the
 * operator is bound (scripts/bind-operator-clerk-user.ts).
 *
 * This has to run BEFORE any SlotRule is seeded. Before Migration B the
 * ordering was the other way round (seed rules with a null venueId, then
 * backfill), which stopped being possible the moment SlotRule.venueId became
 * NOT NULL — a venue now has to exist before anything can point at it.
 */
export async function ensureDefaultVenue(db: PrismaClient): Promise<string> {
  const existing = await db.venue.findUnique({ where: { slug: VENUE_ZERO_SLUG }, select: { id: true } });
  if (existing) return existing.id;

  const tenant = await db.tenant.create({ data: { name: 'Tenant Zero (legacy)' } });
  const venue = await db.venue.create({
    data: {
      tenantId: tenant.id,
      slug: VENUE_ZERO_SLUG,
      code: 'TFLY',
      name: 'Turfly',
      contactPhone: '+8801700000000',
      contactEmail: 'hello@turfly.example',
      rulesText:
        'One 90-minute slot per booking. Please arrive 10 minutes early. ' +
        'Cancellations are free up to 6 hours before your slot.',
      holdMinutes: Number(process.env.HOLD_MINUTES ?? 10),
      cancellationWindowHours: Number(process.env.CANCELLATION_WINDOW_HOURS ?? 6),
      bookingWindowDays: Number(process.env.BOOKING_WINDOW_DAYS ?? 14),
      // bkashNumber / depositPercent / paymentVerificationHours keep their
      // schema defaults — the owner sets the real bKash number from the
      // dashboard after first sign-in.
    },
  });
  return venue.id;
}
