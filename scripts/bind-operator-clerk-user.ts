/**
 * IDEMPOTENT: binds the platform operator's real Clerk account to the
 * legacy `admin@turf.local` staff row, grants them PlatformAdmin, and makes
 * them the owner of Tenant Zero.
 *
 * Run once, after Migration M1 (20260824180000_clerk_staff_identity):
 *
 *   OPERATOR_CLERK_USER_ID=user_xxx OPERATOR_EMAIL=you@example.com \
 *   OPERATOR_NAME="Your Name" pnpm exec tsx scripts/bind-operator-clerk-user.ts
 *
 * WHY REBIND RATHER THAN CREATE A FRESH ROW: the `admin@turf.local` row is
 * the FK target of every historical Booking.createdById,
 * Blackout.createdById, Payment.receivedById and AuditLog.actorId written
 * before the Clerk cutover. Creating a new row and deleting the old one
 * would either fail on those constraints or orphan the entire audit trail.
 * Rebinding preserves all of it and correctly re-labels that history as
 * "the operator" — which is who it actually was.
 *
 * The moderator@turf.local row is deactivated, NOT deleted, for the same
 * reason. A real counter-staff account is re-created later through the
 * Clerk invitation flow (Stage 8).
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const LEGACY_OWNER_EMAIL = 'admin@turf.local';
const LEGACY_MODERATOR_EMAIL = 'moderator@turf.local';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(
      `Missing ${name}.\n\n` +
        'Usage:\n' +
        '  OPERATOR_CLERK_USER_ID=user_xxx OPERATOR_EMAIL=you@example.com \\\n' +
        '  OPERATOR_NAME="Your Name" pnpm exec tsx scripts/bind-operator-clerk-user.ts\n\n' +
        'Find the Clerk user id in the Clerk dashboard under Users — it looks like "user_2abc...".',
    );
    process.exit(1);
  }
  return value;
}

async function main() {
  const clerkUserId = requireEnv('OPERATOR_CLERK_USER_ID');
  const email = requireEnv('OPERATOR_EMAIL');
  const name = process.env.OPERATOR_NAME ?? 'Platform Operator';

  // If this Clerk id is already bound to some OTHER row, stop rather than
  // creating a second identity for the same human — the unique constraint
  // would reject it anyway, but a clear message beats a P2002.
  const alreadyBound = await prisma.user.findUnique({ where: { clerkUserId } });
  if (alreadyBound && alreadyBound.email !== LEGACY_OWNER_EMAIL && alreadyBound.email !== email) {
    console.error(
      `Clerk user ${clerkUserId} is already bound to User "${alreadyBound.email}" (${alreadyBound.id}).\n` +
        'Refusing to bind it a second time. Resolve that row first.',
    );
    process.exit(1);
  }

  const legacyOwner = await prisma.user.findFirst({
    where: { OR: [{ email: LEGACY_OWNER_EMAIL }, { clerkUserId }, { email }] },
  });

  if (!legacyOwner) {
    console.error(
      `No staff row found for "${LEGACY_OWNER_EMAIL}", "${email}", or Clerk id ${clerkUserId}.\n` +
        'Nothing to rebind — if this is a fresh database, run `pnpm db:seed` first.',
    );
    process.exit(1);
  }

  const operator = await prisma.user.update({
    where: { id: legacyOwner.id },
    data: {
      clerkUserId,
      email,
      name,
      // invitedEmail is what resolveStaffUser() checks before binding a
      // Clerk account to this row. Setting it here keeps the invariant
      // "every bound row was explicitly authorised for that address" true
      // even for this hand-bound legacy row.
      invitedEmail: email,
      // Belt and braces: the credentials login path is gone after Stage 2,
      // but null it now so this row cannot be password-authenticated in
      // the window between M1 and the cutover.
      passwordHash: null,
      role: 'ADMIN',
      isActive: true,
    },
  });
  console.log(`Rebound User ${operator.id} ("${LEGACY_OWNER_EMAIL}" → "${email}") to Clerk ${clerkUserId}.`);

  const platformAdmin = await prisma.platformAdmin.upsert({
    where: { clerkUserId },
    update: { email, name },
    create: { clerkUserId, email, name },
  });
  console.log(`PlatformAdmin granted to ${platformAdmin.clerkUserId}.`);

  // Tenant Zero predates onboarding, so it has no owner. Claim it, so the
  // operator resolves to OWNER on Venue Zero through the ordinary
  // Tenant.ownerClerkUserId path rather than only via PlatformAdmin
  // impersonation (which is meant for support, and is audited as such).
  const tenantZero = await prisma.tenant.findFirst({
    where: { ownerClerkUserId: null },
    orderBy: { createdAt: 'asc' },
  });
  if (tenantZero) {
    await prisma.tenant.update({
      where: { id: tenantZero.id },
      data: { ownerClerkUserId: clerkUserId, ownerEmail: email },
    });
    console.log(`Tenant Zero (${tenantZero.id}) owner set to ${clerkUserId}.`);
  } else {
    console.log('No unowned tenant found — Tenant Zero already has an owner, skipping.');
  }

  const moderator = await prisma.user.updateMany({
    where: { email: LEGACY_MODERATOR_EMAIL, isActive: true },
    data: { isActive: false, passwordHash: null },
  });
  if (moderator.count > 0) {
    console.log(`Deactivated ${LEGACY_MODERATOR_EMAIL} (row kept — it is an FK target).`);
  }

  console.log('\nDone. This script is idempotent — re-running it is safe.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
