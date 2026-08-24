/**
 * RBAC on /admin/*. Two layers, and the distinction matters:
 *
 *  - middleware.ts proves only that SOMEBODY is signed in. That is what
 *    the first test below covers, and it needs no account.
 *  - the role check (Owner vs Manager vs Bookie) lives in each page's own
 *    `await requireRole(...)` and in every Server Action. Middleware does
 *    not do it, deliberately: a role is resolved from Tenant/VenueStaff/
 *    PlatformAdmin rows, and that is a database read that does not belong
 *    in middleware.
 *
 * The role-level tests are skipped pending Clerk test users — see the
 * describe block below for exactly what is needed to unskip them. They are
 * left in place rather than deleted because the behavior they assert is
 * still required; only the way to authenticate has changed.
 */
import { expect, test } from '@playwright/test';

const OWNER_ONLY_ROUTES = ['/admin/pricing', '/admin/reports', '/admin/audit'];
const STAFF_ROUTES = ['/admin', '/admin/calendar', '/admin/bookings', '/admin/blackouts', '/admin/customers'];

test.describe('RBAC — the signed-in gate on /admin/*', () => {
  test('unauthenticated visitors are sent to sign-in for every /admin/* route', async ({ page }) => {
    for (const route of [...STAFF_ROUTES, ...OWNER_ONLY_ROUTES]) {
      await page.goto(route);
      // Clerk's own sign-in URL, not the retired /login. Matches both the
      // in-app /sign-in route and a hosted accounts.*.clerk.accounts.dev
      // redirect, since which one applies depends on instance settings.
      await expect(page).toHaveURL(/sign-in|accounts\..*clerk/);
    }
  });
});

/**
 * TO UNSKIP: these need two Clerk users on the test instance, and a
 * password-based sign-in strategy enabled (Clerk's testing helpers cannot
 * drive a social-only instance).
 *
 *   1. pnpm add -D @clerk/testing
 *   2. In the Clerk dashboard, enable Email + Password for the test/dev
 *      instance, then create two users:
 *        - one bound to a User row with no VenueStaff grant and no
 *          Tenant.ownerClerkUserId  -> should be refused everything
 *        - one bound to a VenueStaff BOOKIE grant on Venue Zero
 *          -> staff routes yes, Owner-only routes no
 *      Bind each with scripts/bind-operator-clerk-user.ts's approach, or
 *      by setting User.invitedEmail and letting first sign-in bind it.
 *   3. Put their credentials in E2E_BOOKIE_EMAIL / E2E_BOOKIE_PASSWORD etc.
 *   4. Add `setupClerkTestingToken({ page })` in a beforeEach and use
 *      `clerk.signIn({ page, signInParams: { strategy: 'password', ... } })`.
 *
 * Do not paper over this by pointing the tests at the operator account —
 * an Owner passes every assertion here trivially and the suite would go
 * green while testing nothing.
 */
test.describe.skip('RBAC — role gate (needs Clerk test users)', () => {
  test('a BOOKIE session is refused every Owner-only route', async ({ page }) => {
    for (const route of OWNER_ONLY_ROUTES) {
      await page.goto(route);
      await expect(page.getByText(/do not have permission|don't have permission/i)).toBeVisible();
    }
  });

  test('a BOOKIE session CAN reach the ordinary staff routes', async ({ page }) => {
    for (const route of STAFF_ROUTES) {
      await page.goto(route);
      await expect(page).toHaveURL(new RegExp(route.replace('/', '\\/') + '$'));
    }
  });

  test('an OWNER session can reach every Owner-only route', async ({ page }) => {
    for (const route of OWNER_ONLY_ROUTES) {
      await page.goto(route);
      await expect(page).toHaveURL(new RegExp(route.replace('/', '\\/') + '$'));
      await expect(page.getByText(/do not have permission/i)).toHaveCount(0);
    }
  });
});
