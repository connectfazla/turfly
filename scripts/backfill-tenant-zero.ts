/**
 * IDEMPOTENT: creates "Tenant Zero" and its one Venue ("Venue Zero") if
 * they don't already exist, then backfills venueId (and tenantId, where
 * that column exists) onto every existing Booking / SlotRule / Blackout /
 * Payment / AuditLog row that doesn't have one yet.
 *
 * Run any time after prisma/seed.ts — that script seeds SlotRule/User
 * rows but deliberately does NOT create a Venue (see its own header
 * comment); this script is what turns a fresh `pnpm db:seed` into a
 * fully working single-venue database, and is also safe to re-run at any
 * point afterward (e.g. after a fresh migration) since every step here
 * only acts on rows that don't have what they need yet.
 *
 * The specific field values below (venue name, contact info, rules text)
 * originally came from copying the pre-multi-tenant VenueSetting
 * singleton row the FIRST time this script ran, before that table was
 * dropped — see prisma/schema.prisma's bottom note. They're now just this
 * script's own seed defaults, identical in spirit to what
 * prisma/seed.ts's old seedVenueSetting() used to write; the owner edits
 * them from the dashboard afterward exactly as before.
 *
 * "Tenant Zero" has no Clerk Organization (clerkOrgId stays null) — it
 * predates the SaaS conversion and represents the one physical venue that
 * already existed before any real Turf Owner ever signed up through the
 * new onboarding flow. See prisma/schema.prisma's Tenant model doc
 * comment and the SaaS architecture plan (CLAUDE.md §11).
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const TENANT_ZERO_NAME = 'Tenant Zero (legacy)';
const VENUE_ZERO_SLUG = 'default';
const VENUE_ZERO_CODE = 'TFLY';

async function main() {
  // Idempotent: re-running this script (e.g. after a partial failure)
  // must not create a second Tenant Zero / Venue Zero.
  let venue = await prisma.venue.findUnique({ where: { slug: VENUE_ZERO_SLUG } });

  if (!venue) {
    const tenant = await prisma.tenant.create({
      data: { name: TENANT_ZERO_NAME },
    });

    venue = await prisma.venue.create({
      data: {
        tenantId: tenant.id,
        slug: VENUE_ZERO_SLUG,
        code: VENUE_ZERO_CODE,
        name: 'Turfly',
        contactPhone: '+8801700000000',
        contactEmail: 'hello@turfly.example',
        rulesText:
          'One 90-minute slot per booking. Please arrive 10 minutes early. ' +
          'Cancellations are free up to 6 hours before your slot.',
        holdMinutes: Number(process.env.HOLD_MINUTES ?? 10),
        cancellationWindowHours: Number(process.env.CANCELLATION_WINDOW_HOURS ?? 6),
        bookingWindowDays: Number(process.env.BOOKING_WINDOW_DAYS ?? 14),
        // bkashNumber/depositPercent/paymentVerificationHours all keep
        // their schema @default(...) values — the owner sets the real
        // bKash number from the dashboard after first login, same as
        // VenueSetting.bkashNumber's original doc comment described.
      },
    });

    console.log(`Created Tenant Zero (${tenant.id}) and Venue Zero (${venue.id}, slug="${venue.slug}").`);
  } else {
    console.log(`Venue Zero already exists (${venue.id}) — skipping creation, backfilling rows only.`);
  }

  const [bookings, slotRules, blackouts, payments, auditLogs] = await Promise.all([
    prisma.booking.updateMany({
      where: { venueId: null },
      data: { venueId: venue.id, tenantId: venue.tenantId },
    }),
    prisma.slotRule.updateMany({
      where: { venueId: null },
      data: { venueId: venue.id },
    }),
    prisma.blackout.updateMany({
      where: { venueId: null },
      data: { venueId: venue.id },
    }),
    prisma.payment.updateMany({
      where: { venueId: null },
      data: { venueId: venue.id },
    }),
    prisma.auditLog.updateMany({
      where: { venueId: null },
      data: { venueId: venue.id, tenantId: venue.tenantId },
    }),
  ]);

  console.log(
    `Backfilled: ${bookings.count} Booking, ${slotRules.count} SlotRule, ${blackouts.count} Blackout, ` +
      `${payments.count} Payment, ${auditLogs.count} AuditLog row(s).`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
