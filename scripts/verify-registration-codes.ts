/**
 * Proves the registration-code guarantees against the real database.
 *
 *   pnpm exec tsx scripts/verify-registration-codes.ts
 *
 * The one that matters most is the concurrent double-redemption: the whole
 * point of a one-time code is that two people racing on the same string
 * cannot both win. That is a claim about Postgres row-lock behavior under
 * READ COMMITTED, not about our TypeScript, so asserting it in a unit test
 * with a mocked client would prove nothing.
 *
 * Cleans up after itself — every row it creates is prefixed and deleted.
 */
import { PrismaClient } from '@prisma/client';
import {
  claimRegistrationCode,
  completeRegistrationCode,
  generateRegistrationCode,
  InvalidRegistrationCodeError,
  releaseRegistrationCode,
} from '../lib/registration-code';

const prisma = new PrismaClient();
let ISSUER = '';
const created: string[] = [];

let failures = 0;
function check(pass: boolean, label: string) {
  console.log(pass ? `  ✓ ${label}` : `  ✗ ${label}`);
  if (!pass) failures++;
}

async function issue(opts: { expiresAt?: Date | null } = {}) {
  const { code, display } = generateRegistrationCode();
  await prisma.registrationCode.create({
    data: { code, display, createdByUserId: ISSUER, expiresAt: opts.expiresAt ?? null },
  });
  created.push(code);
  return { code, display };
}

/** Codes need a real issuer now that createdByUserId is an FK. Any existing
 * user will do — this script never signs in as them. */
async function resolveIssuer() {
  const row = await prisma.user.findFirst({ select: { id: true } });
  if (!row) throw new Error('No users exist — run prisma/seed.ts first.');
  ISSUER = row.id;
}

/**
 * Stable synthetic user ids.
 *
 * redeemedByUserId is NOT a foreign key — deliberately, because a code can be
 * claimed by someone whose account is later deleted, and losing the record of
 * who claimed it would be worse than a dangling id. That means this script
 * can use plain strings for the actors without creating rows for each.
 */
function u(label: string): string {
  return `verify-user-${label}`;
}

async function main() {
  await resolveIssuer();
  console.log('\nRegistration codes\n');

  // 1. A fresh code redeems once.
  {
    const { display } = await issue();
    const claimed = await claimRegistrationCode(display, u('A'));
    check(!claimed.resumed, 'a fresh code redeems');
  }

  // 2. Redeeming the same code as somebody else fails.
  {
    const { display } = await issue();
    await claimRegistrationCode(display, u('A'));
    let refused = false;
    try {
      await claimRegistrationCode(display, u('B'));
    } catch (e) {
      refused = e instanceof InvalidRegistrationCodeError;
    }
    check(refused, 'a second person cannot redeem the same code');
  }

  // 3. THE IMPORTANT ONE: two simultaneous redemptions, exactly one wins.
  {
    const { display } = await issue();
    const results = await Promise.allSettled([
      claimRegistrationCode(display, u('RACE_1')),
      claimRegistrationCode(display, u('RACE_2')),
    ]);
    const won = results.filter((r) => r.status === 'fulfilled').length;
    check(won === 1, `exactly one of two concurrent redemptions wins (got ${won})`);
  }

  // 4. The same person resumes rather than being locked out.
  {
    const { display } = await issue();
    await claimRegistrationCode(display, u('C'));
    const again = await claimRegistrationCode(display, u('C'));
    check(again.resumed, 'the same person resumes an unfinished signup');
  }

  // 5. A released code is redeemable again — by anyone.
  {
    const { code, display } = await issue();
    await claimRegistrationCode(display, u('D'));
    await releaseRegistrationCode(code, u('D'));
    const after = await claimRegistrationCode(display, u('E'));
    check(!after.resumed, 'a released code is redeemable again');
  }

  // 6. Release cannot be performed by someone who does not hold the claim.
  {
    const { code, display } = await issue();
    await claimRegistrationCode(display, u('F'));
    await releaseRegistrationCode(code, u('IMPOSTOR'));
    const row = await prisma.registrationCode.findUnique({ where: { code } });
    check(row?.redeemedByUserId === u('F'), 'a stranger cannot release someone else’s claim');
  }

  // 7. A revoked code cannot be redeemed.
  {
    const { code, display } = await issue();
    await prisma.registrationCode.update({ where: { code }, data: { revokedAt: new Date() } });
    let refused = false;
    try {
      await claimRegistrationCode(display, u('G'));
    } catch (e) {
      refused = e instanceof InvalidRegistrationCodeError;
    }
    check(refused, 'a revoked code cannot be redeemed');
  }

  // 8. An expired code cannot be redeemed.
  {
    const { display } = await issue({ expiresAt: new Date(Date.now() - 1000) });
    let refused = false;
    try {
      await claimRegistrationCode(display, u('H'));
    } catch (e) {
      refused = e instanceof InvalidRegistrationCodeError;
    }
    check(refused, 'an expired code cannot be redeemed');
  }

  // 9. Completing binds the tenant, and only for the claimant.
  {
    const { code, display } = await issue();
    await claimRegistrationCode(display, u('I'));
    let refusedForStranger = false;
    try {
      await completeRegistrationCode(code, u('STRANGER'), 'tenant_x');
    } catch (e) {
      refusedForStranger = e instanceof InvalidRegistrationCodeError;
    }
    check(refusedForStranger, 'a stranger cannot complete someone else’s code');
  }

  // 10. A completed code can no longer be released.
  {
    const { code, display } = await issue();
    await claimRegistrationCode(display, u('J'));
    const tenant = await prisma.tenant.create({ data: { name: 'Verify Script Tenant' } });
    await completeRegistrationCode(code, u('J'), tenant.id);
    await releaseRegistrationCode(code, u('J'));
    const row = await prisma.registrationCode.findUnique({ where: { code } });
    check(row?.redeemedAt !== null && row?.tenantId === tenant.id, 'a completed code cannot be released');
    await prisma.registrationCode.update({ where: { code }, data: { tenantId: null } });
    await prisma.tenant.delete({ where: { id: tenant.id } });
  }

  // 11. Garbage input is refused without touching anything.
  {
    let refused = false;
    try {
      await claimRegistrationCode('NOT-A-REAL-CODE', u('K'));
    } catch (e) {
      refused = e instanceof InvalidRegistrationCodeError;
    }
    check(refused, 'garbage input is refused');
  }

  console.log(
    failures === 0 ? '\nAll registration-code checks passed.\n' : `\n${failures} CHECK(S) FAILED\n`,
  );
  if (failures > 0) process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (created.length) {
      await prisma.registrationCode.deleteMany({ where: { code: { in: created } } });
    }
    await prisma.$disconnect();
  });
