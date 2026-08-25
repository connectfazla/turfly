import { cache } from 'react';
import { prisma } from './prisma';
import { getRequestVenueId } from './request-venue';

/** Fallback only for the (should-never-happen) case where a Venue row is
 * missing entirely - e.g. a database that hasn't been seeded/provisioned
 * yet. */
export const DEFAULT_VENUE_NAME = 'Turfly';

/**
 * The Venue row (replaces the old global VenueSetting singleton as of the
 * multi-tenant conversion — see prisma/schema.prisma's bottom note),
 * memoized per request via React's cache(). SiteHeader, SiteFooter, the
 * admin nav, the login page, and the homepage's hero copy all need it —
 * without this, a single page render (header + footer + page-specific
 * content) would fire 2-3 identical queries instead of one. cache() only
 * dedupes within a single request/render pass, so this is safe even
 * though the value can change between requests (an owner editing it from
 * their dashboard).
 *
 * `venueId` is optional and, for now, every existing call site omits it —
 * they all resolve to lib/tenant.ts's getDefaultVenueId() ("Venue Zero"),
 * which is the only venue that exists as of this pass and keeps behavior
 * identical to the old singleton lookup. Once /v/[venueSlug] routes and
 * the owner dashboard exist, those call sites pass a real venueId instead
 * of relying on the default.
 */
export const getVenueSetting = cache(async (venueId?: string) => {
  // Defaults to the venue the REQUEST is for (from the subdomain), which is
  // right for the public booking pages. Pass an explicit venueId anywhere the
  // venue comes from somewhere else — notably /admin, where it comes from the
  // signed-in staff member's grant, not the host.
  const id = venueId ?? (await getRequestVenueId());
  return prisma.venue.findUnique({ where: { id } });
});

/** Convenience for the common case of just wanting the display name with
 * its fallback applied. */
export async function getVenueName(venueId?: string): Promise<string> {
  const venue = await getVenueSetting(venueId);
  return venue?.name ?? DEFAULT_VENUE_NAME;
}
