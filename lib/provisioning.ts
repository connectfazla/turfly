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
import { randomVenueCode, venueCodeFrom } from './venue-slug';

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
 * Venue Zero is the pre-SaaS physical venue — it predates onboarding, so its
 * tenant has no owner account until one is granted
 * (scripts/grant-platform-admin.ts).
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

// ------------------------------------------------------- tenant provisioning

export interface ProvisionTenantInput {
  /** The already-signed-in owner's User.id. */
  ownerUserId: string;
  ownerName: string;
  ownerEmail: string;
  businessName: string;
  venueName: string;
  slug: string;
  contactPhone: string;
  contactEmail?: string;
  rulesText: string;
  /** The already-claimed registration code. Bound to the new tenant here. */
  registrationCode: string;
}

export interface ProvisionedTenant {
  tenantId: string;
  venueId: string;
  venueSlug: string;
  venueCode: string;
  /** True when this call found an existing business rather than creating one. */
  alreadyExisted: boolean;
}

/**
 * Creates a business and its first venue in ONE transaction.
 *
 * Everything that must be true together is in here: the tenant, the venue,
 * its 112 slot rules, the owner's local User row (the FK anchor every future
 * booking and audit entry points at), and binding the registration code to
 * the tenant it produced. A partial success would leave a business that
 * cannot be signed into, or a burned code with nothing behind it.
 *
 * Clerk Organization creation is deliberately NOT in here — see
 * ensureClerkOrg() for why.
 *
 * Retries on a Venue.code collision. Checking whether a code is free and then
 * inserting is a race; letting the unique index reject and retrying with a
 * fresh random code is the version that is actually correct under concurrency.
 */
export async function provisionTenant(
  prisma: PrismaClient,
  input: ProvisionTenantInput,
): Promise<ProvisionedTenant> {
  // Idempotency: a double-submitted form, or an owner returning to
  // /onboarding after finishing, gets their existing business rather than a
  // second one. Tenant.ownerClerkUserId is UNIQUE, so this is belt to the
  // database's braces, not a substitute for it.
  const existing = await prisma.tenant.findUnique({
    where: { ownerUserId: input.ownerUserId },
    select: { id: true, venues: { select: { id: true, slug: true, code: true }, take: 1 } },
  });
  if (existing?.venues[0]) {
    return {
      tenantId: existing.id,
      venueId: existing.venues[0].id,
      venueSlug: existing.venues[0].slug,
      venueCode: existing.venues[0].code,
      alreadyExisted: true,
    };
  }

  const MAX_CODE_ATTEMPTS = 5;
  let lastError: unknown;

  for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
    const venueCode = attempt === 0 ? venueCodeFrom(input.venueName) : randomVenueCode();

    try {
      return await prisma.$transaction(
        async (tx) => {
          const tenant = await tx.tenant.create({
            data: {
              name: input.businessName,
              ownerUserId: input.ownerUserId,
              ownerEmail: input.ownerEmail,
            },
          });

          const venue = await tx.venue.create({
            data: {
              tenantId: tenant.id,
              slug: input.slug,
              code: venueCode,
              name: input.venueName,
              contactPhone: input.contactPhone,
              contactEmail: input.contactEmail || null,
              rulesText: input.rulesText,
            },
          });

          await seedSlotRulesForVenue(tx, venue.id);

          // The owner's User row already exists — they signed up and verified
          // before reaching onboarding. Fetched rather than created so the
          // audit entries below can be attributed to them.
          const user = await tx.user.findUniqueOrThrow({ where: { id: input.ownerUserId } });

          // Phase 2 of the code's lifecycle. Scoped to this claimant, so a
          // code held by somebody else cannot be completed here.
          const bound = await tx.registrationCode.updateMany({
            where: { code: input.registrationCode, redeemedByUserId: input.ownerUserId, tenantId: null },
            data: { tenantId: tenant.id },
          });
          if (bound.count !== 1) {
            // Rolls the whole transaction back. Reaching here means the code
            // was revoked or completed between claiming and provisioning.
            throw new Error('REGISTRATION_CODE_NO_LONGER_CLAIMABLE');
          }

          await tx.auditLog.createMany({
            data: [
              {
                actorId: user.id,
                action: 'TENANT_CREATED',
                entityType: 'Tenant',
                entityId: tenant.id,
                tenantId: tenant.id,
                after: { name: input.businessName, ownerEmail: input.ownerEmail },
              },
              {
                actorId: user.id,
                action: 'VENUE_CREATED',
                entityType: 'Venue',
                entityId: venue.id,
                tenantId: tenant.id,
                venueId: venue.id,
                after: { name: input.venueName, slug: input.slug, code: venueCode },
              },
            ],
          });

          return {
            tenantId: tenant.id,
            venueId: venue.id,
            venueSlug: venue.slug,
            venueCode: venue.code,
            alreadyExisted: false,
          };
        },
        // 30s, wider than the booking engine's 15s, for a reason specific to
        // this path: Neon auto-suspends an idle compute, and provisioning is
        // frequently the FIRST query after a quiet period — a new owner
        // signing up is by definition not part of steady traffic. A cold
        // start observed here took 22.7s end to end and blew a 15s budget.
        // This runs once per tenant, ever, so a generous ceiling costs
        // nothing and a timeout costs an owner their signup.
        { timeout: 30_000, maxWait: 10_000 },
      );
    } catch (err) {
      lastError = err;
      // Only a Venue.code collision is worth retrying. A slug collision is
      // the owner's input and must surface as a form error; anything else is
      // a real failure.
      if (isUniqueViolationOn(err, 'code')) continue;
      throw err;
    }
  }

  throw lastError ?? new Error('Could not allocate a venue code.');
}

/** True when err is a P2002 whose target includes the given column. */
function isUniqueViolationOn(err: unknown, column: string): boolean {
  if (!(err && typeof err === 'object' && 'code' in err && (err as { code?: string }).code === 'P2002')) {
    return false;
  }
  const target = (err as { meta?: { target?: unknown } }).meta?.target;
  const names = Array.isArray(target) ? target : typeof target === 'string' ? [target] : [];
  return names.some((n) => String(n).includes(column));
}

export { isUniqueViolationOn };
