/**
 * Multi-field / multi-sport pass, step 2 of 3 (schema migration, THIS
 * script, schema migration) — see prisma/schema.prisma's bottom note.
 *
 *   pnpm exec tsx scripts/backfill-fields.ts
 *
 * Creates exactly one Field per existing Venue (name = the venue's own
 * name, sportName = "Football" — this app's origin sport, a default every
 * owner can rename, never a lock-in) and points every existing
 * SlotRule/Blackout/Booking row at it. Idempotent: a venue that already has
 * a Field is skipped entirely, so re-running after a partial failure picks
 * up only what's left. Safe to run against a live database — every write
 * here is additive (a new Field row) or narrows an existing NULL fieldId to
 * a real one; nothing is deleted or reassigned away from a value it
 * already has.
 *
 * Run scripts/verify-fields-backfilled.ts afterward, or just re-run this
 * script — it prints a zero-remaining-NULLs count either way, which is
 * what the follow-up migration's `ALTER COLUMN fieldId SET NOT NULL`
 * requires to succeed at all.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const DEFAULT_SPORT_NAME = 'Football';

async function main() {
  const venues = await prisma.venue.findMany({ select: { id: true, name: true } });
  console.log(`${venues.length} venue(s) found.`);

  let created = 0;
  let skipped = 0;

  for (const venue of venues) {
    const existing = await prisma.field.findFirst({ where: { venueId: venue.id }, select: { id: true } });
    if (existing) {
      skipped++;
      continue;
    }

    const field = await prisma.field.create({
      data: { venueId: venue.id, name: venue.name, sportName: DEFAULT_SPORT_NAME, isActive: true, sortOrder: 0 },
    });
    created++;

    // Raw SQL, not the typed client: prisma/schema.prisma already declares
    // fieldId as required (the schema describes the END state this whole
    // pass produces), so the generated client types Booking.fieldId etc. as
    // a non-nullable string — a typed `where: { fieldId: null }` wouldn't
    // compile even though the actual column is still nullable at this
    // point in the rollout. Raw SQL sidesteps the mismatch entirely, and a
    // bulk UPDATE is the right shape for a backfill regardless.
    const [slotRules, blackouts, bookings] = await Promise.all([
      prisma.$executeRaw`UPDATE "SlotRule" SET "fieldId" = ${field.id} WHERE "venueId" = ${venue.id} AND "fieldId" IS NULL`,
      prisma.$executeRaw`UPDATE "Blackout" SET "fieldId" = ${field.id} WHERE "venueId" = ${venue.id} AND "fieldId" IS NULL`,
      prisma.$executeRaw`UPDATE "Booking" SET "fieldId" = ${field.id} WHERE "venueId" = ${venue.id} AND "fieldId" IS NULL`,
    ]);
    console.log(
      `  ${venue.name} (${venue.id}) -> Field ${field.id}: ${slotRules} SlotRule, ${blackouts} Blackout, ${bookings} Booking row(s)`,
    );
  }

  console.log(`\n${created} Field(s) created, ${skipped} venue(s) already had one.`);

  const [remaining] = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT
      (SELECT count(*) FROM "SlotRule" WHERE "fieldId" IS NULL)
      + (SELECT count(*) FROM "Blackout" WHERE "fieldId" IS NULL)
      + (SELECT count(*) FROM "Booking" WHERE "fieldId" IS NULL)
      AS count
  `;
  const remainingCount = Number(remaining!.count);
  if (remainingCount > 0) {
    console.error(
      `\n${remainingCount} row(s) still have a NULL fieldId — the follow-up migration's ` +
        `ALTER COLUMN fieldId SET NOT NULL will fail. This should not happen if every row's ` +
        `venueId points at a real Venue; investigate before proceeding.`,
    );
    process.exit(1);
  }
  console.log('Every SlotRule/Blackout/Booking row has a fieldId. Safe to run the follow-up migration.');
}

main()
  .catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
