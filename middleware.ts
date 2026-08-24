import { clerkMiddleware } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

/**
 * Every staff/owner/platform surface. Middleware's ONLY job here is "is
 * somebody signed in" — it deliberately does no role check and reads no
 * database.
 *
 * The role check used to live here as an ADMIN_ONLY_PREFIXES list. It
 * moved to the pages themselves (`await requireRole('OWNER')` at the top of
 * each) because a role is now resolved from Tenant/VenueStaff/PlatformAdmin
 * rows, and a per-request Prisma query in middleware is both slow and the
 * wrong place for it. Four single-file routes, four one-line guards,
 * colocated with what they protect — which is what CLAUDE.md §7 asks for
 * anyway ("re-check the role inside every action — middleware alone is not
 * authorisation").
 */
const PROTECTED_PREFIXES = ['/admin', '/dashboard', '/super-admin', '/onboarding'];

/**
 * Plain prefix matching rather than Clerk's createRouteMatcher, which is
 * deprecated: it warns that path matching in middleware can diverge from
 * how Next.js actually routes a request, leaving a protected resource
 * reachable. That warning is exactly right, and the answer is not a better
 * matcher — it is to not rely on this as the authorisation boundary at all.
 *
 * What this does is a redirect convenience: send a signed-out visitor to
 * sign-in instead of letting them hit a page that throws. The ACTUAL gate
 * is resource-based, in app/admin/layout.tsx and in every page and Server
 * Action beneath it, all of which call requireRole() against the database.
 * If this matcher ever missed a route, the page would still refuse — it
 * would just refuse with an error instead of a tidy redirect.
 */
export default clerkMiddleware(async (clerkAuth, req) => {
  const { pathname } = req.nextUrl;
  const isProtected = PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  if (isProtected) {
    await clerkAuth.protect();
  }
  return NextResponse.next();
});

export const config = {
  matcher: [
    // Clerk's recommended default: skip Next.js internals and static
    // assets, always run for API/tRPC routes.
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
    '/__clerk/:path*',
  ],
  // Node.js runtime rather than Edge: Clerk supports it, and it keeps the
  // door open for middleware that needs Node APIs. (It was originally set
  // to silence an Auth.js/jose warning; that reason is gone, the setting is
  // still the right default here.)
  runtime: 'nodejs',
};
