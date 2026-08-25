/**
 * Seeds (or refreshes) the public sales demo: a fictional venue with a full
 * season of realistic dummy activity, reachable at /demo with no signup and
 * no password — a prospective owner picks a role and lands straight in the
 * real dashboard.
 *
 *   pnpm exec tsx scripts/create-demo-venue.ts            # create if missing
 *   pnpm exec tsx scripts/create-demo-venue.ts --reset     # wipe & reseed fresh data
 *
 * WHY A REAL VENUE, NOT A MOCKUP: app/admin/* already talks to the real
 * database through the real Server Actions. Building a second, fake copy of
 * the dashboard for demo purposes would drift from the product the moment
 * either one changed. Seeding a real Tenant/Venue and handing out a real
 * (if unusual) session is the only way "what a prospect sees" and "what an
 * owner sees" are provably the same code.
 *
 * SHARED, NOT PER-VISITOR: every demo visitor lands on the SAME venue, so
 * one visitor's clicking around is visible to the next. That is an accepted
 * trade for how small this product is — building a fresh sandboxed venue
 * per visitor is a lot of extra plumbing for a sales tool. --reset is the
 * remedy: run it before a live walkthrough to start from a clean, realistic
 * state. Two things CANNOT be broken by a visitor even without a reset,
 * enforced in app/actions/venue-staff.ts:
 *   - the Manager/Bookie accounts the role-switcher depends on can never be
 *     deactivated or reassigned;
 *   - inviting a THIRD "staff member" is refused, so the public demo login
 *     can never be used to relay a real email to an arbitrary address.
 */
import { PrismaClient, type BookingSource, type PaymentClaimStatus, type PaymentMethod } from '@prisma/client';
import { ALL_SLOT_INDEXES, MAINTENANCE_SLOT } from '../lib/slots';
import { defaultSlotPrice } from '../lib/pricing';
import { seedSlotRulesForVenue, SLOT_RULES_PER_VENUE } from '../lib/provisioning';

const prisma = new PrismaClient();

// Must match lib/demo.ts's DEMO_VENUE_SLUG exactly — see that file's
// comment for why this is NOT the reserved word `demo`.
const DEMO_VENUE_SLUG = 'green-pitch-arena';
const DEMO_VENUE_CODE = 'DEMO';
const DEMO_TENANT_NAME = 'Demo Sports Ltd.';
const DEMO_VENUE_NAME = 'Green Pitch Arena';

/** Emails use .invalid — the codebase's existing convention for fixture
 * accounts (scripts/create-test-venue.ts, scripts/verify-onboarding.ts) —
 * so nothing ever attempts to deliver real mail to them. */
const ACCOUNTS = {
  OWNER: { email: 'demo-owner@turfly.invalid', name: 'Nusrat Jahan' },
  MANAGER: { email: 'demo-manager@turfly.invalid', name: 'Rakib Hasan' },
  BOOKIE: { email: 'demo-bookie@turfly.invalid', name: 'Karim Ahmed' },
} as const;

const PAST_DAYS = 18;
const FUTURE_DAYS = 10;

/** A pool of customers, reused across bookings so some show up as repeat
 * players — matching how a real venue's customer list actually looks,
 * rather than one row per booking. */
const CUSTOMER_POOL = [
  { fullName: 'Tanvir Ahmed', phone: '+8801711000001' },
  { fullName: 'Sabbir Rahman', phone: '+8801711000002' },
  { fullName: 'Mehedi Hasan', phone: '+8801711000003' },
  { fullName: 'Imran Kabir', phone: '+8801711000004' },
  { fullName: 'Shafiul Islam', phone: '+8801711000005' },
  { fullName: 'Nayeem Chowdhury', phone: '+8801711000006' },
  { fullName: 'Rafiul Alam', phone: '+8801711000007' },
  { fullName: 'Asif Mahmud', phone: '+8801711000008' },
  { fullName: 'Fahim Faisal', phone: '+8801711000009' },
  { fullName: 'Jubayer Hossain', phone: '+8801711000010' },
  { fullName: 'Rakibul Islam', phone: '+8801711000011' },
  { fullName: 'Shanto Das', phone: '+8801711000012' },
  { fullName: 'Arafat Karim', phone: '+8801711000013' },
  { fullName: 'Naimur Rashid', phone: '+8801711000014' },
  { fullName: 'Tamim Sheikh', phone: '+8801711000015' },
  { fullName: 'Habibur Rahman', phone: '+8801711000016' },
  { fullName: 'Zubayer Ahsan', phone: '+8801711000017' },
  { fullName: 'Mahfuzur Noor', phone: '+8801711000018' },
];

const TEAM_NAMES = ['Thunder FC', 'Falcons XI', 'Riverside United', 'Night Owls', 'Blue Tigers', null, null];

function randOf<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}
function randInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}
function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setUTCDate(r.getUTCDate() + n);
  return r;
}
function utcDate(y: number, m: number, day: number): Date {
  return new Date(Date.UTC(y, m, day));
}
function bookableSlots(): number[] {
  return ALL_SLOT_INDEXES.filter((i) => i !== MAINTENANCE_SLOT);
}

async function ensureAccounts() {
  const entries = await Promise.all(
    (Object.keys(ACCOUNTS) as (keyof typeof ACCOUNTS)[]).map(async (key) => {
      const { email, name } = ACCOUNTS[key];
      const user = await prisma.user.upsert({
        where: { email },
        // Reset to a known-good state on every run — a demo account must
        // never end up deactivated or unverified from something else
        // touching this row.
        update: { name, isActive: true, emailVerifiedAt: new Date() },
        create: { email, name, isActive: true, emailVerifiedAt: new Date() },
      });
      return [key, user] as const;
    }),
  );
  return Object.fromEntries(entries) as Record<keyof typeof ACCOUNTS, Awaited<ReturnType<typeof prisma.user.upsert>>>;
}

async function ensureTenantAndVenue(ownerUserId: string) {
  let venue = await prisma.venue.findUnique({ where: { slug: DEMO_VENUE_SLUG } });
  if (venue) {
    // Reset drift an owner-role visitor may have caused, so the demo always
    // starts from the same footing even without --reset.
    venue = await prisma.venue.update({
      where: { id: venue.id },
      data: {
        name: DEMO_VENUE_NAME,
        isActive: true,
        depositPercent: 30,
        bkashNumber: '01712345678',
        paymentVerificationHours: 24,
        rulesText:
          'One 90-minute slot per booking. Please arrive 10 minutes early. ' +
          'Cancellations are free up to 6 hours before your slot. Bring your own footballs are welcome.',
      },
    });
    await prisma.tenant.update({ where: { id: venue.tenantId }, data: { isDemo: true, ownerUserId } });
    return venue;
  }

  const tenant = await prisma.tenant.create({
    data: { name: DEMO_TENANT_NAME, ownerUserId, ownerEmail: ACCOUNTS.OWNER.email, isDemo: true },
  });
  venue = await prisma.venue.create({
    data: {
      tenantId: tenant.id,
      slug: DEMO_VENUE_SLUG,
      code: DEMO_VENUE_CODE,
      name: DEMO_VENUE_NAME,
      contactPhone: '+8801700000001',
      contactEmail: 'hello@greenpitcharena.invalid',
      rulesText:
        'One 90-minute slot per booking. Please arrive 10 minutes early. ' +
        'Cancellations are free up to 6 hours before your slot. Bring your own footballs are welcome.',
      depositPercent: 30,
      bkashNumber: '01712345678',
    },
  });
  return venue;
}

/**
 * IDEMPOTENT: the demo venue's two fields — a primary football pitch (all
 * of the rich booking/payment/blackout history below lives on this one,
 * unchanged from before the multi-field pass) and a second, lightly-seeded
 * badminton court (its own live price grid, deliberately no booking
 * history) so a visitor sees the headline "add another field" capability
 * for real, not just described on the landing page. Doubling the booking
 * generator's realism onto a second field is a bigger rewrite than this
 * pass's demo needs — "here's a freshly added field, ready to take
 * bookings" is itself a fine, honest sales story.
 */
async function ensureFields(venueId: string, venueName: string) {
  const existing = await prisma.field.findMany({
    where: { venueId },
    orderBy: { sortOrder: 'asc' },
    select: { id: true, sportName: true },
  });

  const primary =
    existing.find((f) => f.sportName === 'Football') ??
    (await prisma.field.create({ data: { venueId, name: venueName, sportName: 'Football', sortOrder: 0 } }));
  const secondary =
    existing.find((f) => f.sportName === 'Badminton') ??
    (await prisma.field.create({
      data: { venueId, name: 'Court B', sportName: 'Badminton', sortOrder: 1 },
    }));

  return { primaryFieldId: primary.id, secondaryFieldId: secondary.id };
}

async function ensureStaffGrants(venueId: string, tenantId: string, manager: { id: string }, bookie: { id: string }) {
  await prisma.venueStaff.upsert({
    where: { venueId_userId: { venueId, userId: manager.id } },
    update: { role: 'MANAGER', isActive: true },
    create: { venueId, tenantId, userId: manager.id, role: 'MANAGER' },
  });
  await prisma.venueStaff.upsert({
    where: { venueId_userId: { venueId, userId: bookie.id } },
    update: { role: 'BOOKIE', isActive: true },
    create: { venueId, tenantId, userId: bookie.id, role: 'BOOKIE' },
  });
}

async function ensureCustomers() {
  const customers = await Promise.all(
    CUSTOMER_POOL.map((c) =>
      prisma.customer.upsert({
        where: { phone: c.phone },
        update: { fullName: c.fullName, isBlocked: false, blockedReason: null },
        create: { ...c, teamName: randOf(TEAM_NAMES) },
      }),
    ),
  );
  // One blocked customer, so /admin/customers has something to show besides
  // a wall of green rows — a real venue's list always has at least one.
  const blocked = customers[customers.length - 1]!;
  await prisma.customer.update({
    where: { id: blocked.id },
    data: { isBlocked: true, blockedReason: 'Repeated no-shows without notice.' },
  });
  return customers;
}

/** Clears everything reset should wipe: bookings (and their payments cascade
 * via bookingId FK — deleted explicitly since there is no onDelete: Cascade
 * on Payment), blackouts, audit entries, and the reference counter, then
 * the slot-price grid (deleted rather than updated — nothing else
 * references SlotRule by foreign key, so drop-and-reseed is simplest). */
async function wipe(venueId: string) {
  const bookingIds = (await prisma.booking.findMany({ where: { venueId }, select: { id: true } })).map((b) => b.id);
  await prisma.payment.deleteMany({ where: { bookingId: { in: bookingIds } } });
  await prisma.booking.deleteMany({ where: { venueId } });
  await prisma.blackout.deleteMany({ where: { venueId } });
  await prisma.auditLog.deleteMany({ where: { venueId } });
  await prisma.venueReferenceCounter.deleteMany({ where: { venueId } });
  await prisma.slotRule.deleteMany({ where: { venueId } });
  await prisma.customer.updateMany({ where: { phone: { startsWith: '+880171100' } }, data: { totalBookings: 0, totalNoShows: 0 } });
}

interface SeedContext {
  venueId: string;
  /** The primary (football) field — every seeded booking/blackout below
   * lives here. See ensureFields()'s doc comment for why the second field
   * stays booking-free. */
  fieldId: string;
  tenantId: string;
  owner: { id: string };
  manager: { id: string };
  bookie: { id: string };
  customers: { id: string; phone: string }[];
  slotPrice: Map<string, number>;
  now: Date;
}

let referenceSeq = 0;
function nextRef(now: Date): string {
  referenceSeq += 1;
  return `TRF-${DEMO_VENUE_CODE}-${now.getFullYear()}-${String(referenceSeq).padStart(4, '0')}`;
}

/** One booking + (usually) its matching Payment row, bypassing the booking
 * engine entirely — this is fixture data being planted directly, not
 * traffic replaying real concurrency, so the engine's transaction/locking
 * machinery has nothing to add here. Still respects the partial unique
 * index: callers never seed two live bookings for the same (date, slot). */
async function seedBooking(
  ctx: SeedContext,
  date: Date,
  slotIndex: number,
  status: 'CONFIRMED' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW' | 'PENDING_VERIFICATION',
) {
  const price = ctx.slotPrice.get(`${date.getUTCDay()}:${slotIndex}`)!;
  const customer = randOf(ctx.customers);
  const source: BookingSource = Math.random() < 0.6 ? 'COUNTER' : 'ONLINE';
  const staffMember = Math.random() < 0.5 ? ctx.bookie : ctx.manager;

  let paymentStatus: 'UNPAID' | 'PARTIAL' | 'PAID' = 'UNPAID';
  let amountPaid = 0;
  let checkedInAt: Date | null = null;

  if (status === 'CONFIRMED' || status === 'COMPLETED') {
    if (source === 'COUNTER') {
      paymentStatus = 'PAID';
      amountPaid = price;
    } else {
      paymentStatus = 'PARTIAL';
      amountPaid = Math.round((price * 30) / 100);
    }
    if (status === 'COMPLETED') checkedInAt = date;
  } else if (status === 'CANCELLED' && Math.random() < 0.4) {
    // A customer who paid the deposit online, then cancelled.
    paymentStatus = 'PARTIAL';
    amountPaid = Math.round((price * 30) / 100);
  }

  const booking = await prisma.booking.create({
    data: {
      reference: nextRef(ctx.now),
      venueId: ctx.venueId,
      fieldId: ctx.fieldId,
      tenantId: ctx.tenantId,
      customerId: customer.id,
      date,
      slotIndex,
      status,
      priceAmount: price,
      paymentStatus,
      amountPaid,
      source,
      createdById: source === 'COUNTER' ? staffMember.id : null,
      checkedInAt,
      cancelledAt: status === 'CANCELLED' ? date : null,
      cancelReason: status === 'CANCELLED' ? randOf(['Change of plans', 'Weather', 'Team unavailable']) : null,
      paymentVerificationExpiresAt: status === 'PENDING_VERIFICATION' ? addDays(ctx.now, 1) : null,
    },
  });

  if (status === 'PENDING_VERIFICATION') {
    await prisma.payment.create({
      data: {
        bookingId: booking.id,
        venueId: ctx.venueId,
        amount: Math.round((price * 30) / 100),
        method: 'BKASH',
        status: 'PENDING',
        trxId: `8${randInt(100000000, 999999999)}`,
      },
    });
  } else if (amountPaid > 0) {
    const method: PaymentMethod = source === 'COUNTER' ? randOf(['CASH', 'BKASH', 'NAGAD'] as const) : 'BKASH';
    const paymentStatusValue: PaymentClaimStatus = 'VERIFIED';
    await prisma.payment.create({
      data: {
        bookingId: booking.id,
        venueId: ctx.venueId,
        amount: amountPaid,
        method,
        status: paymentStatusValue,
        receivedById: staffMember.id,
        trxId: method === 'BKASH' ? `8${randInt(100000000, 999999999)}` : null,
      },
    });
  }

  await prisma.customer.update({
    where: { id: customer.id },
    data: {
      totalBookings: { increment: 1 },
      totalNoShows: status === 'NO_SHOW' ? { increment: 1 } : undefined,
    },
  });

  await prisma.auditLog.create({
    data: {
      actorId: booking.createdById ?? ctx.owner.id,
      action: 'BOOKING_CREATED',
      entityType: 'Booking',
      entityId: booking.id,
      venueId: ctx.venueId,
      tenantId: ctx.tenantId,
      after: { reference: booking.reference, status },
      createdAt: date < ctx.now ? date : ctx.now,
    },
  });

  return booking;
}

async function seedBookings(ctx: SeedContext) {
  let created = 0;

  for (let i = PAST_DAYS; i >= 1; i--) {
    const day = addDays(ctx.now, -i);
    const slots = bookableSlots().sort(() => Math.random() - 0.5).slice(0, randInt(4, 9));
    for (const slotIndex of slots) {
      const roll = Math.random();
      const status = roll < 0.78 ? 'COMPLETED' : roll < 0.93 ? 'CANCELLED' : 'NO_SHOW';
      await seedBooking(ctx, day, slotIndex, status);
      created++;
    }
  }

  // Today: a mix of already-checked-in slots and a couple later today.
  const todaySlots = bookableSlots().sort(() => Math.random() - 0.5).slice(0, 7);
  for (const slotIndex of todaySlots) {
    const status = slotIndex < 12 ? 'COMPLETED' : 'CONFIRMED';
    await seedBooking(ctx, ctx.now, slotIndex, status);
    created++;
  }

  for (let i = 1; i <= FUTURE_DAYS; i++) {
    const day = addDays(ctx.now, i);
    const slots = bookableSlots().sort(() => Math.random() - 0.5).slice(0, randInt(2, 5));
    for (const slotIndex of slots) {
      const status = Math.random() < 0.25 ? 'PENDING_VERIFICATION' : 'CONFIRMED';
      await seedBooking(ctx, day, slotIndex, status);
      created++;
    }
  }

  return created;
}

async function seedBlackout(ctx: SeedContext) {
  const day = addDays(ctx.now, 5);
  await prisma.blackout.create({
    data: {
      venueId: ctx.venueId,
      fieldId: ctx.fieldId,
      date: day,
      slotIndex: null, // whole day
      reason: 'Ground maintenance — resurfacing the goal areas.',
      createdById: ctx.owner.id,
    },
  });
  await prisma.auditLog.create({
    data: {
      actorId: ctx.owner.id,
      action: 'BLACKOUT_CREATED',
      entityType: 'Blackout',
      entityId: 'demo-blackout',
      venueId: ctx.venueId,
      tenantId: ctx.tenantId,
      after: { date: day.toISOString(), reason: 'Ground maintenance' },
    },
  });
}

async function buildSlotPriceIndex(fieldId: string): Promise<Map<string, number>> {
  // Field-scoped, not venue-scoped (multi-field pass) — with two fields
  // sharing this venue, a venueId-only query would mix both fields' rows
  // into one (dayOfWeek, slotIndex) map and silently overwrite one field's
  // prices with the other's.
  const rules = await prisma.slotRule.findMany({ where: { fieldId } });
  const map = new Map<string, number>();
  for (const r of rules) map.set(`${r.dayOfWeek}:${r.slotIndex}`, Number(r.price));
  return map;
}

async function main() {
  const reset = process.argv.includes('--reset');
  const now = new Date(Date.UTC(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()));

  console.log(`\n${reset ? 'Resetting' : 'Ensuring'} the demo venue...\n`);

  const accounts = await ensureAccounts();
  const venue = await ensureTenantAndVenue(accounts.OWNER.id);
  const { primaryFieldId, secondaryFieldId } = await ensureFields(venue.id, DEMO_VENUE_NAME);
  await ensureStaffGrants(venue.id, venue.tenantId, accounts.MANAGER, accounts.BOOKIE);
  const customers = await ensureCustomers();

  if (reset) {
    await wipe(venue.id);
    console.log('  Cleared existing bookings, payments, blackouts, audit log and price grid.');
  }

  // Unconditional, not gated on "does the venue have any rules yet" — that
  // check was fine when a venue had one field, but Court B (added this
  // pass) would need its OWN 112 rows even on a venue whose PRIMARY field
  // already has all of its rules, and a venue-wide count can't tell the
  // difference. seedSlotRulesForVenue's skipDuplicates makes calling it
  // for an already-seeded field a safe no-op either way.
  const [primaryRules, secondaryRules] = await Promise.all([
    seedSlotRulesForVenue(prisma, venue.id, primaryFieldId),
    seedSlotRulesForVenue(prisma, venue.id, secondaryFieldId),
  ]);
  console.log(
    `  SlotRule: ${primaryRules}/${SLOT_RULES_PER_VENUE} rows seeded for Green Pitch Arena, ` +
      `${secondaryRules}/${SLOT_RULES_PER_VENUE} for Court B.`,
  );

  const existingBookings = await prisma.booking.count({ where: { venueId: venue.id } });
  if (existingBookings === 0) {
    const slotPrice = await buildSlotPriceIndex(primaryFieldId);
    const ctx: SeedContext = {
      venueId: venue.id,
      fieldId: primaryFieldId,
      tenantId: venue.tenantId,
      owner: accounts.OWNER,
      manager: accounts.MANAGER,
      bookie: accounts.BOOKIE,
      customers,
      slotPrice,
      now,
    };
    const count = await seedBookings(ctx);
    await seedBlackout(ctx);
    await prisma.venueReferenceCounter.upsert({
      where: { venueId_year: { venueId: venue.id, year: now.getFullYear() } },
      create: { venueId: venue.id, year: now.getFullYear(), next: referenceSeq + 1 },
      update: { next: referenceSeq + 1 },
    });
    console.log(`  Booking: ${count} created across ${PAST_DAYS} past + today + ${FUTURE_DAYS} upcoming days.`);
  } else {
    console.log(`  Booking: ${existingBookings} already present — pass --reset to regenerate.`);
  }

  console.log(
    `\nDemo ready.\n` +
      `  Dashboard:  /demo  (pick Owner / Manager / Bookie — no password)\n` +
      `  Fields:     Green Pitch Arena (football, full booking history) + Court B (badminton, freshly added)\n` +
      `  Public site: http://demo.lvh.me:3000/book   (local)\n` +
      `               https://demo.turfly.xyz/book   (once the wildcard domain is live)\n` +
      `\nRe-run with --reset before a live walkthrough to start from a clean state.`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
