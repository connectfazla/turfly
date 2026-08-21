/**
 * BUILD_PLAN.md step 8: "Run an axe-core accessibility pass over every
 * public route and fix all critical violations."
 */
import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { formatDateParam } from '../lib/format';

const today = formatDateParam(new Date());

const PUBLIC_ROUTES = ['/', '/book', `/book/${today}`, '/booking/lookup', '/rules'];

test.describe('accessibility — public routes', () => {
  for (const route of PUBLIC_ROUTES) {
    test(`${route} has no critical or serious axe violations`, async ({ page }) => {
      await page.goto(route);
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();

      const seriousOrWorse = results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');

      if (seriousOrWorse.length > 0) {
        const summary = seriousOrWorse
          .map((v) => `${v.id} (${v.impact}): ${v.help} — ${v.nodes.length} node(s)`)
          .join('\n');
        console.log(`[axe] ${route}:\n${summary}`);
      }

      expect(seriousOrWorse, JSON.stringify(seriousOrWorse, null, 2)).toHaveLength(0);
    });
  }
});
