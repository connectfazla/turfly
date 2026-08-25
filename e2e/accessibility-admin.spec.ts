/**
 * Same axe pass as e2e/accessibility.spec.ts, extended to the admin panel.
 * BUILD_PLAN.md step 8 only requires public routes; the admin panel gets
 * the same bar since staff use it daily too.
 *
 * Own throwaway Tenant/Venue/User fixture, created directly via Prisma with
 * a known bcrypt password and signed in through the real /sign-in form —
 * same approach as e2e/rbac.spec.ts, kept independent (a different slug and
 * email) so the two files never race each other regardless of run order.
 *
 * Logs in ONCE and reuses that session for every route (rather than one
 * login per route) — sign-in is rate-limited (`lib/auth/rate-limit.ts`),
 * and looping routes inside a single logged-in test keeps this suite's
 * sign-in count small regardless of how many routes it covers.
 */
import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { prisma } from '../lib/prisma';
import { hashPassword } from '../lib/auth/password';
import { seedSlotRulesForVenue } from '../lib/provisioning';

const ADMIN_ROUTES = ['/admin', '/admin/calendar', '/admin/bookings', '/admin/bookings/new', '/admin/blackouts', '/admin/customers'];
const ADMIN_ONLY_ROUTES = ['/admin/pricing', '/admin/branding', '/admin/reports', '/admin/audit'];

const FIXTURE_SLUG = 'e2e-axe-fixture';
const OWNER_EMAIL = 'e2e-axe-owner@turfly.invalid';
const TEST_PASSWORD = 'e2e-axe-fixture-password-2026';

async function seedFixture() {
  const passwordHash = await hashPassword(TEST_PASSWORD);
  const owner = await prisma.user.upsert({
    where: { email: OWNER_EMAIL },
    update: { passwordHash, isActive: true, emailVerifiedAt: new Date() },
    create: { email: OWNER_EMAIL, name: 'E2E Axe Owner', passwordHash, emailVerifiedAt: new Date() },
  });

  let venue = await prisma.venue.findUnique({ where: { slug: FIXTURE_SLUG } });
  if (!venue) {
    const tenant = await prisma.tenant.create({
      data: { name: 'E2E Axe Fixture', ownerUserId: owner.id, ownerEmail: OWNER_EMAIL },
    });
    venue = await prisma.venue.create({
      data: {
        tenantId: tenant.id,
        slug: FIXTURE_SLUG,
        code: 'E2EA',
        name: 'E2E Axe Fixture Venue',
        contactPhone: '+8801700000098',
        rulesText: 'e2e fixture — not a real venue.',
      },
    });
    await seedSlotRulesForVenue(prisma, venue.id);
  }
}

async function teardownFixture() {
  const venue = await prisma.venue.findUnique({ where: { slug: FIXTURE_SLUG } });
  if (venue) {
    await prisma.slotRule.deleteMany({ where: { venueId: venue.id } });
    await prisma.venue.delete({ where: { id: venue.id } });
    await prisma.tenant.delete({ where: { id: venue.tenantId } });
  }
  await prisma.session.deleteMany({ where: { user: { email: OWNER_EMAIL } } });
  await prisma.user.deleteMany({ where: { email: OWNER_EMAIL } });
}

test.describe('admin panel accessibility', () => {
  test.beforeAll(async () => {
    await teardownFixture();
    await seedFixture();
  });
  test.afterAll(async () => {
    await teardownFixture();
    await prisma.$disconnect();
  });

  test('admin panel routes have no critical or serious axe violations (OWNER session)', async ({ page }) => {
    // 10 routes x (page load + full axe scan) in one test, by design (see
    // the file header) — the default 30s budget was already tight before
    // the left-sidebar layout added more DOM to every one of those scans.
    test.setTimeout(90_000);

    await page.goto('/sign-in');
    await page.getByLabel('Email').fill(OWNER_EMAIL);
    await page.getByLabel('Password', { exact: true }).fill(TEST_PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.waitForURL('**/admin');

    const failures: string[] = [];

    for (const route of [...ADMIN_ROUTES, ...ADMIN_ONLY_ROUTES]) {
      await page.goto(route);
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
      const seriousOrWorse = results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');

      if (seriousOrWorse.length > 0) {
        const summary = seriousOrWorse.map((v) => `  ${v.id} (${v.impact}): ${v.help} — ${v.nodes.length} node(s)`).join('\n');
        failures.push(`${route}:\n${summary}`);
      }
    }

    if (failures.length > 0) console.log(`[axe]\n${failures.join('\n')}`);
    expect(failures, failures.join('\n\n')).toHaveLength(0);
  });
});
