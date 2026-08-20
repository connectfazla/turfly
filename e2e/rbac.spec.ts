/**
 * BUILD_PLAN.md step 5: a MODERATOR session must be refused every
 * Admin-only surface, both by direct URL AND by calling the Server Action
 * directly. This file covers the URL/middleware half now; the "calling the
 * action directly" half is appended once the admin Server Actions exist
 * (BUILD_PLAN.md steps 6-7 — see e2e/admin-actions-rbac.spec.ts).
 */
import { expect, test } from '@playwright/test';

const ADMIN_ONLY_ROUTES = ['/admin/pricing', '/admin/reports', '/admin/users', '/admin/audit'];
const STAFF_ROUTES = ['/admin', '/admin/calendar', '/admin/bookings', '/admin/blackouts', '/admin/customers'];

async function login(page: import('@playwright/test').Page, email: string, password: string) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('**/admin');
}

test.describe('RBAC — middleware gate on /admin/*', () => {
  test('unauthenticated visitors are redirected to /login for any /admin/* route', async ({ page }) => {
    for (const route of [...STAFF_ROUTES, ...ADMIN_ONLY_ROUTES]) {
      await page.goto(route);
      await expect(page).toHaveURL(/\/login/);
    }
  });

  test('a MODERATOR session is refused all four Admin-only routes by direct URL', async ({ page }) => {
    await login(page, 'moderator@turf.local', process.env.SEED_MODERATOR_PASSWORD ?? 'Moderator123!');

    for (const route of ADMIN_ONLY_ROUTES) {
      await page.goto(route);
      await expect(page).toHaveURL(/\/admin\?forbidden=1/);
      await expect(page.getByText("You don't have permission to view that page.")).toBeVisible();
    }
  });

  test('a MODERATOR session CAN reach the non-Admin-only staff routes', async ({ page }) => {
    await login(page, 'moderator@turf.local', process.env.SEED_MODERATOR_PASSWORD ?? 'Moderator123!');

    for (const route of STAFF_ROUTES) {
      await page.goto(route);
      await expect(page).toHaveURL(new RegExp(route.replace('/', '\\/') + '$'));
    }
  });

  test('an ADMIN session can reach every Admin-only route', async ({ page }) => {
    await login(page, 'admin@turf.local', process.env.SEED_ADMIN_PASSWORD ?? 'Admin123!');

    for (const route of ADMIN_ONLY_ROUTES) {
      await page.goto(route);
      await expect(page).toHaveURL(new RegExp(route.replace('/', '\\/') + '$'));
      await expect(page.getByText("You don't have permission")).toHaveCount(0);
    }
  });
});
