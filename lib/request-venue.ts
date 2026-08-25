/**
 * Resolves WHICH venue a public request is for.
 *
 * `turfly.xyz/dhanmondi/book`, `dhanmondi.turfly.xyz/book` and
 * `turfly.xyz/book` (Venue Zero) are all the same page serving different
 * businesses. Rather than rewriting to a `/v/[slug]/...` route tree and
 * duplicating every booking page under it, the pages stay where they are and
 * ask this. Same result, a fraction of the code, and no risk of the copies
 * drifting apart.
 *
 * Three sources, in descending order of trustworthiness AND descending
 * strictness about what happens when the slug doesn't resolve to a real,
 * active venue:
 *
 *   1. The host header (resolveHost) — a real subdomain, when a venue has
 *      one configured. Most specific, so it wins. STRICT: unresolvable is a
 *      genuine notFound() — no rewrite happened, so nothing about Next's
 *      client router gets confused by it (see below).
 *   2. PATH_VENUE_HEADER, set by middleware.ts ONLY on a request it just
 *      rewrote from `/{slug}/...` — never persisted past this one request.
 *      STRICT: unresolvable redirects to app/booking-not-found, same
 *      intent as (1)'s notFound(), just a different mechanism (see why
 *      below).
 *   3. PATH_VENUE_COOKIE, the same slug, but surviving across requests on
 *      this origin — what makes the path scheme work for a bare absolute
 *      link like `/book/confirm` that has no slug in it. SOFT: unresolvable
 *      falls through to Venue Zero instead of redirecting. This has to be
 *      soft — the strict behavior redirect()s to app/booking-not-found,
 *      which itself has no slug in ITS OWN url, so it would inherit the
 *      very same stale cookie and redirect to itself, forever. Confirmed by
 *      hand: that loop is exactly what a naive cookie-only version of this
 *      function did the first time a visitor's own bad slug got as far as
 *      app/booking-not-found.
 *
 * Why (1) and (2) need different mechanisms for the "same" strict 404: a
 * path-slug's request arrives at this page via middleware.ts's rewrite — the
 * browser's address bar still shows `/{slug}`, but the page actually
 * rendered is `/book`'s (or `/rules`'s, etc.), so perceived and actual path
 * differ. Calling notFound() from there hits a genuine Next.js/Turbopack
 * hydration bug (confirmed by hand, in both `next dev` and a production
 * `next build && next start`: the not-found content renders into the
 * initial HTML but the client never reveals it — permanently blank page, no
 * console error). redirect() has no such problem: it is a normal navigation
 * to a route whose perceived and actual path are the same thing. A
 * host-based subdomain slug never goes through a rewrite at all — no
 * perceived/actual mismatch to begin with — so it keeps using notFound().
 *
 * None of the three is trusted on its own: all arrive from the browser, so
 * the slug is always re-looked-up against the database.
 */
import { cache } from 'react';
import { cookies, headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { prisma } from './prisma';
import { PATH_VENUE_COOKIE, PATH_VENUE_HEADER, resolveHost } from './subdomain';
import { getDefaultVenueId } from './tenant';

/** Exported so anything that needs to BUILD a venue URL (the admin sidebar's
 * "your booking page" link, lib/subdomain.ts's venueUrl()) uses the exact
 * same fallback as the host-resolution path above, rather than a second
 * `process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? '...'` that could silently drift
 * from this one. */
export const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'turfly.xyz';

export interface RequestVenue {
  id: string;
  slug: string;
  name: string;
}

/**
 * Memoized per request — a single page render may ask for the venue from the
 * header, the footer and the page body, and that should be one query, not
 * three. Same reasoning as lib/tenant.ts's getDefaultVenueId.
 *
 * 404s on an unknown or deactivated slug, and returns the SAME response for
 * both, so this cannot be used to discover which slugs are taken.
 */
export const getRequestVenue = cache(async (): Promise<RequestVenue> => {
  const reqHeaders = await headers();
  const { venueSlug: hostSlug } = resolveHost(reqHeaders.get('host'), ROOT_DOMAIN);
  const pathHeaderSlug = hostSlug ? null : reqHeaders.get(PATH_VENUE_HEADER);
  const cookieSlug = hostSlug || pathHeaderSlug ? null : (await cookies()).get(PATH_VENUE_COOKIE)?.value ?? null;
  const venueSlug = hostSlug ?? pathHeaderSlug ?? cookieSlug;
  const isStrict = Boolean(hostSlug || pathHeaderSlug); // see file header comment

  const venueZero = async () => {
    const id = await getDefaultVenueId();
    return prisma.venue.findUniqueOrThrow({ where: { id }, select: { id: true, slug: true, name: true } });
  };

  if (!venueSlug) return venueZero();

  const venue = await prisma.venue.findUnique({
    where: { slug: venueSlug },
    select: { id: true, slug: true, name: true, isActive: true },
  });
  if (!venue || !venue.isActive) {
    if (!isStrict) return venueZero(); // a stale cookie must not break an otherwise-ordinary page load
    if (hostSlug) notFound();
    redirect('/booking-not-found');
  }

  return { id: venue.id, slug: venue.slug, name: venue.name };
});

/** Convenience for the many call sites that only need the id. */
export async function getRequestVenueId(): Promise<string> {
  return (await getRequestVenue()).id;
}
