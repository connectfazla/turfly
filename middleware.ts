import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE } from '@/lib/auth/constants';
import { PATH_VENUE_COOKIE, PATH_VENUE_HEADER, resolvePathSegment } from '@/lib/subdomain';


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
const PROTECTED_PREFIXES = ['/admin', '/dashboard', '/super-admin', '/onboarding', '/select-venue'];

export default function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Path-based venue resolution: `/{slug}/...` rewrites to the un-prefixed
  // route and stamps PATH_VENUE_COOKIE, which getRequestVenue() reads
  // (lib/request-venue.ts). No database lookup here — resolvePathSegment is
  // pure string matching against RESERVED_SLUGS, so this stays cheap on
  // every request; the actual existence/active check happens once, in a
  // Server Component, same as host-based resolution always has.
  const pathVenue = resolvePathSegment(pathname);
  const effectivePath = pathVenue ? pathVenue.rest || '/book' : pathname;

  const isProtected = PROTECTED_PREFIXES.some((p) => effectivePath === p || effectivePath.startsWith(`${p}/`));

  if (isProtected && !req.cookies.get(SESSION_COOKIE)) {
    const url = new URL('/sign-in', req.nextUrl.origin);
    // Only ever a path, never a full URL — so this cannot be used to bounce
    // somebody to another origin after they sign in.
    url.searchParams.set('next', effectivePath);
    return NextResponse.redirect(url);
  }

  if (pathVenue) {
    const target = req.nextUrl.clone();
    target.pathname = effectivePath;
    // PATH_VENUE_HEADER carries the slug into ONLY this exact request — set
    // on the forwarded request headers, never persisted, gone the moment
    // this response is sent. getRequestVenue() (lib/request-venue.ts) uses
    // its presence to tell "the visitor's own URL just named this venue"
    // (strict: an unresolvable slug here means a real not-found) apart from
    // "PATH_VENUE_COOKIE says so" (soft: a stale cookie from an earlier,
    // different request must not be able to break an otherwise-ordinary
    // page load — see that file's comment on why a naive cookie-only design
    // redirect-loops the moment the cookie names something that stops
    // resolving, which is exactly what happens once the visitor lands on
    // the not-found page itself).
    const forwardHeaders = new Headers(req.headers);
    forwardHeaders.set(PATH_VENUE_HEADER, pathVenue.slug);
    const res = NextResponse.rewrite(target, { request: { headers: forwardHeaders } });
    // Not httpOnly: nothing sensitive rides on it (the DB lookup re-derives
    // and 404s on an unknown/inactive slug), and a client component reading
    // it back would be harmless anyway. One day — long enough to survive a
    // multi-page booking session, short enough that switching to a
    // different venue's link in the same browser corrects itself quickly.
    res.cookies.set(PATH_VENUE_COOKIE, pathVenue.slug, { path: '/', sameSite: 'lax', maxAge: 60 * 60 * 24 });
    return res;
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
};
