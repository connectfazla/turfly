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
const ISSUER = 'user_VERIFYSCRIPT000000000000';
const created: string[] = [];

let failures = 0;
function check(pass: boolean, label: string) {
  console.log(pass ? `  ✓ ${label}` : `  ✗ ${label}`);
  if (!pass) failures++;
}

async function issue(opts: { expiresAt?: Date | null } = {}) {
  const { code, display } = generateRegistrationCode();
  await prisma.registrationCode.create({
    data: { code, display, createdByClerkUserId: ISSUER, expiresAt: opts.expiresAt ?? null },
  });
  created.push(code);
  return { code, display };
}

async function main() {
  console.log('\nRegistration codes\n');

  // 1. A fresh code redeems once.
  {
    const { display } = await issue();
    const claimed = await claimRegistrationCode(display, 'user_A');
    check(!claimed.resumed, 'a fresh code redeems');
  }

  // 2. Redeeming the same code as somebody else fails.
  {
    const { display } = await issue();
    await claimRegistrationCode(display, 'user_A');
    let refused = false;
    try {
      await claimRegistrationCode(display, 'user_B');
    } catch (e) {
      refused = e instanceof InvalidRegistrationCodeError;
    }
    check(refused, 'a second person cannot redeem the same code');
  }

  // 3. THE IMPORTANT ONE: two simultaneous redemptions, exactly one wins.
  {
    const { display } = await issue();
    const results = await Promise.allSettled([
      claimRegistrationCode(display, 'user_RACE_1'),
      claimRegistrationCode(display, 'user_RACE_2'),
    ]);
    const won = results.filter((r) => r.status === 'fulfilled').length;
    check(won === 1, `exactly one of two concurrent redemptions wins (got ${won})`);
  }

  // 4. The same person resumes rather than being locked out.
  {
    const { display } = await issue();
    await claimRegistrationCode(display, 'user_C');
    const again = await claimRegistrationCode(display, 'user_C');
    check(again.resumed, 'the same person resumes an unfinished signup');
  }

  // 5. A released code is redeemable again — by anyone.
  {
    const { code, display } = await issue();
    await claimRegistrationCode(display, 'user_D');
    await releaseRegistrationCode(code, 'user_D');
    const after = await claimRegistrationCode(display, 'user_E');
    check(!after.resumed, 'a released code is redeemable again');
  }

  // 6. Release cannot be performed by someone who does not hold the claim.
  {
    const { code, display } = await issue();
    await claimRegistrationCode(display, 'user_F');
    await releaseRegistrationCode(code, 'user_IMPOSTOR');
    const row = await prisma.registrationCode.findUnique({ where: { code } });
    check(row?.redeemedByClerkUserId === 'user_F', 'a stranger cannot release someone else’s claim');
  }

  // 7. A revoked code cannot be redeemed.
  {
    const { code, display } = await issue();
    await prisma.registrationCode.update({ where: { code }, data: { revokedAt: new Date() } });
    let refused = false;
    try {
      await claimRegistrationCode(display, 'user_G');
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
      await claimRegistrationCode(display, 'user_H');
    } catch (e) {
      refused = e instanceof InvalidRegistrationCodeError;
    }
    check(refused, 'an expired code cannot be redeemed');
  }

  // 9. Completing binds the tenant, and only for the claimant.
  {
    const { code, display } = await issue();
    await claimRegistrationCode(display, 'user_I');
    let refusedForStranger = false;
    try {
      await completeRegistrationCode(code, 'user_STRANGER', 'tenant_x');
    } catch (e) {
      refusedForStranger = e instanceof InvalidRegistrationCodeError;
    }
    check(refusedForStranger, 'a stranger cannot complete someone else’s code');
  }

  // 10. A completed code can no longer be released.
  {
    const { code, display } = await issue();
    await claimRegistrationCode(display, 'user_J');
    const tenant = await prisma.tenant.create({ data: { name: 'Verify Script Tenant' } });
    await completeRegistrationCode(code, 'user_J', tenant.id);
    await releaseRegistrationCode(code, 'user_J');
    const row = await prisma.registrationCode.findUnique({ where: { code } });
    check(row?.redeemedAt !== null && row?.tenantId === tenant.id, 'a completed code cannot be released');
    await prisma.registrationCode.update({ where: { code }, data: { tenantId: null } });
    await prisma.tenant.delete({ where: { id: tenant.id } });
  }

  // 11. Garbage input is refused without touching anything.
  {
    let refused = false;
    try {
      await claimRegistrationCode('NOT-A-REAL-CODE', 'user_K');
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
