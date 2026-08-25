import 'dotenv/config';
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // CI runs the PRODUCTION server (ci.yml runs `pnpm build` immediately
    // before `pnpm e2e`), not `next dev`. This isn't a style preference —
    // dev mode compiles each route on first request (Turbopack JIT), and a
    // route hit for the first time by a test that also expects a
    // server-side redirect (e.g. requireRoleForPage's /admin?forbidden=1)
    // races that compile against the navigation, surfacing as a flaky
    // `net::ERR_ABORTED` on page.goto. Reproduced locally: e2e/rbac.spec.ts
    // failed intermittently under `pnpm dev`, passed reliably under
    // `pnpm start` against the same build. Local runs keep `pnpm dev` for
    // fast iteration, where this flake is rare enough not to matter.
    command: process.env.CI ? 'pnpm start' : 'pnpm dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
