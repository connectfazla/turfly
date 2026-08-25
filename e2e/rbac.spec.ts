/**
 * RBAC on /admin/*. Two layers, and the distinction matters:
 *
 *  - middleware.ts proves only that SOMEBODY is signed in. That is what
 *    the first test below covers, and it needs no account.
 *  - the role check (Owner vs Manager vs Bookie) lives in each page's own
 *    `await requireRole(...)` / `requireRoleForPage(...)` and in every
 *    Server Action. Middleware does not do it, deliberately: a role is
 *    resolved from Tenant/VenueStaff/PlatformAdmin rows, and that is a
 *    database read that does not belong in middleware.
 *
 * Auth is in-house (SECURITY.md), which is what makes the role-level suite
 * below possible without any external test-instance setup: two real
 * accounts are created directly in the database with a known bcrypt
 * password, then signed in through the REAL /sign-in form — no mocking, no
 * stubbed session. Same "talk to the real thing" standard as
 * e2e/concurrency.spec.ts's live-database concurrency proof.
 *
 * The fixture is a throwaway Tenant + Venue, entirely separate from Venue
 * Zero and from anything scripts/create-test-venue.ts or
 * scripts/create-demo-venue.ts seed — this suite must be safe to run
 * against a database that also has those. Cleaned up in afterAll.
 */
import { expect, test, type Page } from '@playwright/test';
import { prisma } from '../lib/prisma';
import { hashPassword } from '../lib/auth/password';
import { seedSlotRulesForVenue } from '../lib/provisioning';

const OWNER_ONLY_ROUTES = ['/admin/pricing', '/admin/reports', '/admin/audit'];
const STAFF_ROUTES = ['/admin', '/admin/calendar', '/admin/bookings', '/admin/blackouts'];

const FIXTURE_SLUG = 'e2e-rbac-fixture';
const OWNER_EMAIL = 'e2e-rbac-owner@turfly.invalid';
const BOOKIE_EMAIL = 'e2e-rbac-bookie@turfly.invalid';
/** Fixed and known on purpose: this account has zero real value to protect
 * — a throwaway tenant with no bookings, no payment capability worth
 * anything, torn down at the end of every run. Not a secret. */
const TEST_PASSWORD = 'e2e-rbac-fixture-password-2026';

async function signInAs(page: Page, email: string): Promise<void> {
  await page.goto('/sign-in');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(TEST_PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('**/admin');
}

async function seedFixture() {
  const passwordHash = await hashPassword(TEST_PASSWORD);

  const owner = await prisma.user.upsert({
    where: { email: OWNER_EMAIL },
    update: { passwordHash, isActive: true, emailVerifiedAt: new Date() },
    create: { email: OWNER_EMAIL, name: 'E2E RBAC Owner', passwordHash, emailVerifiedAt: new Date() },
  });
  const bookie = await prisma.user.upsert({
    where: { email: BOOKIE_EMAIL },
    update: { passwordHash, isActive: true, emailVerifiedAt: new Date() },
    create: { email: BOOKIE_EMAIL, name: 'E2E RBAC Bookie', passwordHash, emailVerifiedAt: new Date() },
  });

  let venue = await prisma.venue.findUnique({ where: { slug: FIXTURE_SLUG } });
  if (!venue) {
    const tenant = await prisma.tenant.create({
      data: { name: 'E2E RBAC Fixture', ownerUserId: owner.id, ownerEmail: OWNER_EMAIL },
    });
    venue = await prisma.venue.create({
      data: {
        tenantId: tenant.id,
        slug: FIXTURE_SLUG,
        code: 'E2ER',
        name: 'E2E RBAC Fixture Venue',
        contactPhone: '+8801700000099',
        rulesText: 'e2e fixture — not a real venue.',
      },
    });
    await seedSlotRulesForVenue(prisma, venue.id);
  }

  await prisma.venueStaff.upsert({
    where: { venueId_userId: { venueId: venue.id, userId: bookie.id } },
    update: { role: 'BOOKIE', isActive: true },
    create: { venueId: venue.id, tenantId: venue.tenantId, userId: bookie.id, role: 'BOOKIE' },
  });
}

async function teardownFixture() {
  const venue = await prisma.venue.findUnique({ where: { slug: FIXTURE_SLUG } });
  if (venue) {
    await prisma.venueStaff.deleteMany({ where: { venueId: venue.id } });
    await prisma.slotRule.deleteMany({ where: { venueId: venue.id } });
    await prisma.venue.delete({ where: { id: venue.id } });
    await prisma.tenant.delete({ where: { id: venue.tenantId } });
  }
  await prisma.session.deleteMany({ where: { user: { email: { in: [OWNER_EMAIL, BOOKIE_EMAIL] } } } });
  await prisma.user.deleteMany({ where: { email: { in: [OWNER_EMAIL, BOOKIE_EMAIL] } } });
}

test.describe('RBAC — the signed-in gate on /admin/*', () => {
  test('unauthenticated visitors are sent to sign-in for every /admin/* route', async ({ page }) => {
    for (const route of [...STAFF_ROUTES, ...OWNER_ONLY_ROUTES]) {
      await page.goto(route);
      await expect(page).toHaveURL(/\/sign-in/);
    }
  });
});

test.describe('RBAC — role gate', () => {
  // Each test signs in once then loads 3-4 routes in sequence, each a real
  // Server Component render with its own database round trip. Against a
  // remote dev database (Neon) that cumulative latency runs close enough to
  // the 30s default to flake — reproduced directly: the second and third
  // page.goto in a row occasionally aborted mid-navigation as the default
  // timeout expired underneath it, reported by Playwright as
  // `net::ERR_ABORTED`. Each individual navigation was fine on its own; the
  // budget was just tight. Matches the precedent already set in
  // e2e/accessibility-admin.spec.ts for the same reason (many routes in one
  // test).
  test.beforeEach(() => {
    test.setTimeout(60_000);
  });

  test.beforeAll(async () => {
    await teardownFixture(); // in case a previous run crashed mid-test
    await seedFixture();
  });
  test.afterAll(async () => {
    await teardownFixture();
    await prisma.$disconnect();
  });

  test('a BOOKIE session is refused every Owner-only route', async ({ page }) => {
    await signInAs(page, BOOKIE_EMAIL);
    for (const route of OWNER_ONLY_ROUTES) {
      await page.goto(route);
      // requireRoleForPage() redirects to /admin?forbidden=1 rather than
      // throwing — see lib/auth/require-role-for-page.ts. Asserting the
      // banner, not just the URL, is what proves it's the intended refusal
      // and not some other reason the route failed to load.
      await expect(page).toHaveURL(/\/admin\?forbidden=1/);
      await expect(page.getByText("You don't have permission to view that page.")).toBeVisible();
    }
  });

  test('a BOOKIE session CAN reach the ordinary staff routes', async ({ page }) => {
    await signInAs(page, BOOKIE_EMAIL);
    for (const route of STAFF_ROUTES) {
      await page.goto(route);
      await expect(page).toHaveURL(new RegExp(route.replace('/', '\\/') + '$'));
    }
  });

  test('an OWNER session can reach every Owner-only route', async ({ page }) => {
    await signInAs(page, OWNER_EMAIL);
    for (const route of OWNER_ONLY_ROUTES) {
      await page.goto(route);
      await expect(page).toHaveURL(new RegExp(route.replace('/', '\\/') + '$'));
      await expect(page.getByText("You don't have permission")).toHaveCount(0);
    }
  });
});
