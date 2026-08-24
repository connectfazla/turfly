/**
 * Same axe pass as e2e/accessibility.spec.ts, extended to the admin panel.
 * BUILD_PLAN.md step 8 only requires public routes; the admin panel gets
 * the same bar since staff use it daily too.
 *
 * SKIPPED pending Clerk test users — see e2e/rbac.spec.ts's skip block for
 * the full setup needed to unskip both suites. The signing-in-once
 * structure below is preserved deliberately: it exists because every route
 * is scanned inside ONE authenticated test rather than authenticating per
 * route, and that shape stays correct under Clerk.
 *
 * The public-route axe coverage in e2e/accessibility.spec.ts needs no
 * account and still runs on every `pnpm e2e`, so the accessibility bar is
 * not entirely unguarded while this is skipped.
 */
import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const ADMIN_ROUTES = ['/admin', '/admin/calendar', '/admin/bookings', '/admin/bookings/new', '/admin/blackouts', '/admin/customers'];
const ADMIN_ONLY_ROUTES = ['/admin/pricing', '/admin/reports', '/admin/audit'];

test.skip('admin panel routes have no critical or serious axe violations (OWNER session)', async ({ page }) => {
  // 10 routes x (page load + full axe scan) in one test, by design (see
  // the file header) — the default 30s budget was already tight before
  // the left-sidebar layout added more DOM to every one of those scans.
  test.setTimeout(90_000);

  // Replace with @clerk/testing:
  //   await setupClerkTestingToken({ page });
  //   await clerk.signIn({ page, signInParams: { strategy: 'password',
  //     identifier: process.env.E2E_OWNER_EMAIL!, password: process.env.E2E_OWNER_PASSWORD! } });
  await page.goto('/admin');

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
