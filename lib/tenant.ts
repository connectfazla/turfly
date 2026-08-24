/**
 * Multi-tenant SaaS conversion, Phase 0: the ONE place that resolves
 * "the venue" when nothing else (a slug in the URL, a signed-in staff
 * session) says which one is meant. Every call site added in this pass
 * (lib/venue.ts, lib/availability-service.ts) falls back to this so the
 * app's behavior is byte-identical to before the conversion — there is
 * still only one venue, "Venue Zero" under "Tenant Zero" (see
 * scripts/backfill-tenant-zero.ts), so resolving to it everywhere a real
 * venueId isn't yet threaded through is not a behavior change.
 *
 * A later pass (once /v/[venueSlug] routes and the owner dashboard exist)
 * replaces most of these fallback call sites with a real venueId resolved
 * from the request — this helper's job shrinks to "the default venue for
 * the legacy /book/* alias route" at that point, per the SaaS
 * architecture plan's routing section. It does not go away entirely.
 */
import { cache } from 'react';
import { prisma } from './prisma';

/** Matches scripts/backfill-tenant-zero.ts's VENUE_ZERO_SLUG constant. */
export const DEFAULT_VENUE_SLUG = 'default';

/**
 * Memoized per request via React's cache() — same reasoning as
 * lib/venue.ts's getVenueSetting: several components on one render pass
 * (header, footer, page content) all need "the default venue," and this
 * ensures that's one query, not three.
 */
export const getDefaultVenueId = cache(async (): Promise<string> => {
  const venue = await prisma.venue.findUniqueOrThrow({
    where: { slug: DEFAULT_VENUE_SLUG },
    select: { id: true },
  });
  return venue.id;
});
