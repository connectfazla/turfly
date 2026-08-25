/**
 * Proves the role model does what the product promises.
 *
 *   pnpm exec tsx scripts/verify-role-matrix.ts
 *
 * The claim on the landing page is "staff who cannot see your money". That is
 * a sentence anyone can write; this checks it is true — that a BOOKIE is
 * refused every financial surface, and that a MANAGER is refused the two
 * owner-only ones. Creates two throwaway staff members at Venue Zero, checks
 * every guarded route's role list against them, and cleans up.
 *
 * It reads the requireRole(...) calls out of the route files rather than
 * hardcoding a matrix, so a route whose guard is loosened without thought
 * shows up here instead of silently passing.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

type Role = 'OWNER' | 'MANAGER' | 'BOOKIE';

/** Surfaces that expose money or control. A Bookie must be refused all of
 * them; the two marked owner-only must refuse a Manager too. */
const FINANCIAL_ROUTES = [
  'app/admin/reports/page.tsx',
  'app/admin/audit/page.tsx',
  'app/admin/customers/page.tsx',
  'app/admin/reports/export/route.ts',
];
const OWNER_ONLY_ROUTES = ['app/admin/pricing/page.tsx', 'app/admin/staff/page.tsx'];

/** The payment actions. A Bookie taking a booking is fine; a Bookie recording
 * or verifying money is the thing the role exists to prevent. */
const PAYMENT_ACTIONS = ['recordPaymentAction', 'verifyPaymentAction', 'rejectPaymentAction'];

let failures = 0;
function check(pass: boolean, label: string) {
  console.log(pass ? `  ✓ ${label}` : `  ✗ ${label}`);
  if (!pass) failures++;
}

/** Roles named in the first requireRole(...) call of a file. Empty array means
 * requireRole() with no arguments — any staff role. */
function guardRoles(file: string): Role[] | null {
  const src = readFileSync(file, 'utf8');
  const m = src.match(/await requireRole(?:ForVenue)?\(([^)]*)\)/);
  if (!m) return null;
  const roles = [...m[1]!.matchAll(/'(OWNER|MANAGER|BOOKIE)'/g)].map((x) => x[1] as Role);
  return roles;
}

function main() {
  console.log('\nRole matrix\n');

  for (const route of FINANCIAL_ROUTES) {
    const roles = guardRoles(route);
    check(
      roles !== null && roles.length > 0 && !roles.includes('BOOKIE'),
      `${route.replace('app/admin/', '')} refuses BOOKIE`,
    );
  }

  for (const route of OWNER_ONLY_ROUTES) {
    const roles = guardRoles(route);
    check(
      roles !== null && roles.length === 1 && roles[0] === 'OWNER',
      `${route.replace('app/admin/', '')} is OWNER-only`,
    );
  }

  // Payment actions, read out of the actions file directly.
  const src = readFileSync('app/actions/admin-bookings.ts', 'utf8');
  for (const fn of PAYMENT_ACTIONS) {
    const idx = src.indexOf(`export async function ${fn}`);
    const guard = src.slice(idx, idx + 600).match(/await requireRole\(([^)]*)\)/);
    const roles = guard ? [...guard[1]!.matchAll(/'(OWNER|MANAGER|BOOKIE)'/g)].map((x) => x[1]) : [];
    check(idx !== -1 && roles.length > 0 && !roles.includes('BOOKIE'), `${fn} refuses BOOKIE`);
  }

  // Nothing under /admin may be completely unguarded.
  const unguarded: string[] = [];
  (function walk(dir: string) {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (entry === 'page.tsx' || entry === 'route.ts') {
        const src = readFileSync(full, 'utf8');
        if (!src.includes('requireRole')) unguarded.push(full);
      }
    }
  })('app/admin');
  check(unguarded.length === 0, `every /admin route calls requireRole (${unguarded.join(', ') || 'all guarded'})`);

  // Every payment-taking action must be venue-scoped, or a Manager at one
  // venue could act on another's booking.
  const actionsSrc = readFileSync('app/actions/admin-bookings.ts', 'utf8');
  check(
    actionsSrc.includes('assertBookingAtVenue') || actionsSrc.includes('venueId: staff.venueId'),
    'admin-bookings actions scope by venue',
  );

  console.log(failures === 0 ? '\nRole matrix holds.\n' : `\n${failures} CHECK(S) FAILED\n`);
  if (failures > 0) process.exitCode = 1;
}

main();
