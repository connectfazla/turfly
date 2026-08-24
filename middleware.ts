import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { NextResponse, type NextRequest } from 'next/server';
import { auth } from '@/auth';

/** The four Admin-only routes — CLAUDE.md §7. Everything else under
 * /admin/* just needs any authenticated staff session. */
const ADMIN_ONLY_PREFIXES = ['/admin/pricing', '/admin/reports', '/admin/users', '/admin/audit'];

/** The pre-existing Auth.js staff/admin guard — unchanged in behavior from
 * before Clerk was added. Kept as a plain function (rather than the
 * top-level `export default`) so it can be delegated to from inside
 * clerkMiddleware below. Clerk only covers the new tenant/customer-facing
 * auth layer added alongside this; staff/admin login stays on Auth.js. */
const requireStaffSession = auth((req) => {
  const { pathname } = req.nextUrl;

  if (!req.auth) {
    const loginUrl = new URL('/login', req.nextUrl.origin);
    loginUrl.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(loginUrl);
  }

  const isAdminOnly = ADMIN_ONLY_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  if (isAdminOnly && req.auth.user.role !== 'ADMIN') {
    return NextResponse.redirect(new URL('/admin?forbidden=1', req.nextUrl.origin));
  }

  return NextResponse.next();
});

const isAdminRoute = createRouteMatcher(['/admin(.*)']);

// clerkMiddleware wraps every matched request so Clerk's session context is
// available anywhere the future tenant/customer pages need it (via auth()
// or the Clerk components) — it does NOT itself protect any route. Admin
// routes are handed off to the existing Auth.js guard above, unchanged.
export default clerkMiddleware(async (_clerkAuth, req: NextRequest, event) => {
  if (isAdminRoute(req)) {
    // auth()'s wrapped-callback type covers both the middleware signature
    // (req, NextFetchEvent) and the Route Handler signature (req, {params}),
    // and TS resolves the union to the latter here — but requireStaffSession's
    // own callback above never reads its second argument either way, so this
    // cast is safe: no behavior depends on what's actually passed through.
    return requireStaffSession(req, event as unknown as Parameters<typeof requireStaffSession>[1]);
  }
  return NextResponse.next();
});

// Middleware alone is NOT authorisation (CLAUDE.md §7) — every staff
// Server Action re-checks via lib/auth/require-role.ts regardless of this.
export const config = {
  matcher: [
    // Clerk's recommended default: skip Next.js internals and static
    // assets, always run for API/tRPC routes.
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
    '/__clerk/:path*',
  ],
  // Auth.js's JWT decoding (jose) uses Node APIs (Compression/DecompressionStream)
  // the Edge runtime doesn't support — harmless for our small session payloads,
  // but Next.js 15's Node.js middleware runtime avoids the warning entirely.
  // Clerk also supports the Node.js middleware runtime, so this still covers
  // both.
  runtime: 'nodejs',
};
