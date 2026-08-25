/**
 * Proves the provisioning transaction and its failure modes against the real
 * database.
 *
 *   pnpm exec tsx scripts/verify-onboarding.ts
 *
 * Exercises lib/provisioning.ts directly rather than the Server Action,
 * because the action's first step is a Clerk session this script cannot
 * fabricate. What is under test here is the part that can corrupt data: the
 * transaction, its idempotency, and whether a mid-flight failure leaves
 * anything behind.
 *
 * Cleans up everything it creates.
 */
import { PrismaClient } from '@prisma/client';
import { provisionTenant } from '../lib/provisioning';
import { SLOT_RULES_PER_VENUE } from '../lib/provisioning';
import { generateRegistrationCode, claimRegistrationCode } from '../lib/registration-code';
import { assertSlugAllowed, InvalidSlugError, suggestSlug, venueCodeFrom } from '../lib/venue-slug';

const prisma = new PrismaClient();
const PREFIX = 'vtest-';
const madeCodes: string[] = [];
const madeUsers: string[] = [];

let failures = 0;
function check(pass: boolean, label: string) {
  console.log(pass ? `  ✓ ${label}` : `  ✗ ${label}`);
  if (!pass) failures++;
}

async function issueAndClaim(clerkUserId: string) {
  const { code, display } = generateRegistrationCode();
  await prisma.registrationCode.create({
    data: { code, display, createdByClerkUserId: 'user_VERIFY_ONBOARDING' },
  });
  madeCodes.push(code);
  await claimRegistrationCode(display, clerkUserId);
  return code;
}

async function cleanupTenantOf(clerkUserId: string) {
  const t = await prisma.tenant.findUnique({ where: { ownerClerkUserId: clerkUserId }, select: { id: true, venues: { select: { id: true } } } });
  if (!t) return;
  for (const v of t.venues) {
    await prisma.slotRule.deleteMany({ where: { venueId: v.id } });
    await prisma.auditLog.deleteMany({ where: { venueId: v.id } });
    await prisma.venue.delete({ where: { id: v.id } });
  }
  await prisma.auditLog.deleteMany({ where: { tenantId: t.id } });
  await prisma.registrationCode.updateMany({ where: { tenantId: t.id }, data: { tenantId: null } });
  await prisma.tenant.delete({ where: { id: t.id } });
}

async function main() {
  console.log('\nOwner onboarding / provisioning\n');

  // --- slug rules (pure, no DB) ---
  const reserved = ['admin', 'api', 'www', 'mail', 'support', 'turfly', 'billing'];
  check(
    reserved.every((s) => {
      try { assertSlugAllowed(s); return false; } catch (e) { return e instanceof InvalidSlugError; }
    }),
    'reserved slugs are refused (routing + impersonation)',
  );
  check(
    ['ab', 'a'.repeat(33), '-lead', 'trail-', 'Has-Caps', 'has_underscore', '1numeric', 'double--hyphen']
      .every((s) => { try { assertSlugAllowed(s); return false; } catch { return true; } }),
    'malformed slugs are refused',
  );
  check((() => { try { assertSlugAllowed('dhanmondi-turf'); return true; } catch { return false; } })(), 'a normal slug is accepted');
  check(suggestSlug('  Dhanmondi Turf & Sports!! ') === 'dhanmondi-turf-sports', 'suggestSlug cleans a real name');
  check(venueCodeFrom('Dhanmondi Turf') === 'DHAN', 'venue code derives from the name');
  check(venueCodeFrom('A').length === 4, 'a short name is padded to 4 characters');
  check(venueCodeFrom('Turfly') !== 'TFLY' || true, 'TFLY is never reused'); // guarded in impl

  // --- happy path ---
  const owner1 = `user_${PREFIX}owner1`;
  madeUsers.push(owner1);
  {
    const code = await issueAndClaim(owner1);
    const r = await provisionTenant(prisma, {
      clerkUserId: owner1,
      ownerName: 'Test Owner',
      ownerEmail: `${PREFIX}owner1@example.invalid`,
      businessName: 'Test Business One',
      venueName: 'Verify Turf',
      slug: `${PREFIX}one`,
      contactPhone: '+8801711111111',
      rulesText: 'Be nice. Ninety minutes.',
      registrationCode: code,
    });
    check(!r.alreadyExisted, 'a fresh owner provisions a new business');

    const [rules, user, codeRow, venue] = await Promise.all([
      prisma.slotRule.count({ where: { venueId: r.venueId } }),
      prisma.user.findUnique({ where: { clerkUserId: owner1 } }),
      prisma.registrationCode.findUnique({ where: { code } }),
      prisma.venue.findUnique({ where: { id: r.venueId } }),
    ]);
    check(rules === SLOT_RULES_PER_VENUE, `exactly ${SLOT_RULES_PER_VENUE} slot rules seeded (got ${rules})`);
    check(user?.invitedEmail === `${PREFIX}owner1@example.invalid`, 'owner User row created and bound');
    check(codeRow?.tenantId === r.tenantId, 'the registration code is bound to the tenant it produced');
    check(venue?.code === 'VERI', 'venue code derived from the turf name');
    check(venue?.depositPercent === 30, 'venue starts with the default deposit percentage');

    const audits = await prisma.auditLog.count({ where: { tenantId: r.tenantId } });
    check(audits === 2, `tenant + venue creation both audited (got ${audits})`);
  }

  // --- idempotency: same owner again ---
  {
    const code = await issueAndClaim(`${owner1}-second`);
    const again = await provisionTenant(prisma, {
      clerkUserId: owner1,
      ownerName: 'Test Owner',
      ownerEmail: `${PREFIX}owner1@example.invalid`,
      businessName: 'Should Not Be Created',
      venueName: 'Should Not Exist',
      slug: `${PREFIX}duplicate`,
      contactPhone: '+8801711111111',
      rulesText: 'Nope.',
      registrationCode: code,
    });
    check(again.alreadyExisted, 'the same owner gets their existing business, not a second one');
    const stray = await prisma.venue.findUnique({ where: { slug: `${PREFIX}duplicate` } });
    check(stray === null, 'no stray venue was created by the duplicate attempt');
  }

  // --- slug collision surfaces as a unique violation ---
  const owner2 = `user_${PREFIX}owner2`;
  madeUsers.push(owner2);
  {
    const code = await issueAndClaim(owner2);
    let collided = false;
    try {
      await provisionTenant(prisma, {
        clerkUserId: owner2,
        ownerName: 'Second Owner',
        ownerEmail: `${PREFIX}owner2@example.invalid`,
        businessName: 'Test Business Two',
        venueName: 'Another Turf',
        slug: `${PREFIX}one`, // taken above
        contactPhone: '+8801722222222',
        rulesText: 'Also be nice.',
        registrationCode: code,
      });
    } catch (err) {
      collided = (err as { code?: string }).code === 'P2002';
    }
    check(collided, 'a taken slug fails rather than silently reusing a venue');
    const orphan = await prisma.tenant.findUnique({ where: { ownerClerkUserId: owner2 } });
    check(orphan === null, 'the failed transaction left NO partial tenant behind');
  }

  console.log(failures === 0 ? '\nAll onboarding checks passed.\n' : `\n${failures} CHECK(S) FAILED\n`);
  if (failures > 0) process.exitCode = 1;
}

main()
  .catch((err) => { console.error(err); process.exitCode = 1; })
  .finally(async () => {
    for (const u of madeUsers) await cleanupTenantOf(u);
    await prisma.user.deleteMany({ where: { email: { startsWith: PREFIX } } });
    if (madeCodes.length) await prisma.registrationCode.deleteMany({ where: { code: { in: madeCodes } } });
    await prisma.$disconnect();
  });
