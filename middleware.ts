import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE } from '@/lib/auth/constants';


/**
 * Redirect convenience ONLY — this is not the authorisation boundary.
 *
 * It checks for the mere PRESENCE of a session cookie, not its validity: it
 * runs on the edge of every request and cannot afford a database round trip,
 * and a forged cookie gets past it. That is fine, because the real gate is
 * `requireRole()` / `requireSuperAdmin()` inside every page and Server Action
 * beneath these paths, which resolves the session and the caller's grants
 * against the database (CLAUDE.md §7).
 *
 * What this buys is a tidy redirect to sign-in instead of an error page for
 * the ordinary signed-out visitor. If it ever missed a route, the page would
 * still refuse — just less gracefully.
 */
const PROTECTED_PREFIXES = ['/admin', '/dashboard', '/super-admin', '/onboarding'];

export default function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // NOTE: subdomain -> venue resolution deliberately does NOT happen here.
  // It needs a database lookup, which middleware cannot afford on every
  // request, and rewriting to a /v/[slug] route tree would mean duplicating
  // every booking page under it. The public pages call getRequestVenue()
  // instead (lib/request-venue.ts), which reads the same host header from a
  // Server Component where a query is fine and React's cache() dedupes it.

  const isProtected = PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  if (isProtected && !req.cookies.get(SESSION_COOKIE)) {
    const url = new URL('/sign-in', req.nextUrl.origin);
    // Only ever a path, never a full URL — so this cannot be used to bounce
    // somebody to another origin after they sign in.
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
};
