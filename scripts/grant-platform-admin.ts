/**
 * Grants (or revokes) platform-operator access, by email.
 *
 *   pnpm exec tsx scripts/grant-platform-admin.ts you@example.com
 *   pnpm exec tsx scripts/grant-platform-admin.ts you@example.com --revoke
 *
 * Replaces scripts/bind-operator-clerk-user.ts, which existed to map a Clerk
 * account onto a local row — a problem that no longer exists now that the
 * local row IS the identity.
 *
 * Deliberately a script rather than a UI: the first platform admin has to be
 * created by someone with database access, or the "only a platform admin can
 * grant platform admin" rule has no starting point.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  const revoke = process.argv.includes('--revoke');

  if (!email) {
    console.error('Usage: tsx scripts/grant-platform-admin.ts <email> [--revoke]');
    process.exit(1);
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    console.error(
      `No account with email "${email}".\n` +
        'Sign up at /sign-up first, then re-run this — a platform admin has to point at a real User row.',
    );
    process.exit(1);
  }

  if (revoke) {
    const removed = await prisma.platformAdmin.deleteMany({ where: { userId: user.id } });
    console.log(removed.count ? `Revoked platform admin from ${email}.` : `${email} was not a platform admin.`);
    return;
  }

  await prisma.platformAdmin.upsert({
    where: { userId: user.id },
    update: {},
    create: { userId: user.id },
  });
  console.log(`${email} is now a platform admin (User ${user.id}).`);

  if (!user.emailVerifiedAt) {
    console.warn('  NOTE: this account has not verified its email yet, so it cannot sign in until it does.');
  }
  if (!user.passwordHash) {
    console.warn('  NOTE: this account has no password yet. Use /forgot-password to set one.');
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
