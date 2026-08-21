/**
 * Same axe pass as e2e/accessibility.spec.ts, extended to the admin panel.
 * BUILD_PLAN.md step 8 only requires public routes; the admin panel gets
 * the same bar since staff use it daily too.
 *
 * Logs in ONCE and reuses that session for every route (rather than one
 * login per route) — login is rate-limited to 10/15min per IP
 * (lib/auth/rate-limit.ts), and a dev/CI run with no reverse proxy has no
 * x-forwarded-for header, so every request in the whole `pnpm e2e` run
 * shares one bucket. Looping routes inside a single logged-in test keeps
 * this suite's login count small regardless of how many routes it covers.
 */
import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const ADMIN_ROUTES = ['/admin', '/admin/calendar', '/admin/bookings', '/admin/bookings/new', '/admin/blackouts', '/admin/customers'];
const ADMIN_ONLY_ROUTES = ['/admin/pricing', '/admin/reports', '/admin/users', '/admin/audit'];

test('admin panel routes have no critical or serious axe violations (ADMIN session)', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill('admin@turf.local');
  await page.getByLabel('Password').fill(process.env.SEED_ADMIN_PASSWORD ?? 'Admin123!');
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
