import { cache } from 'react';
import { prisma } from './prisma';

/** Fallback only for the (should-never-happen) case where the
 * VenueSetting singleton row is missing - e.g. a database that hasn't
 * been seeded yet. */
export const DEFAULT_VENUE_NAME = 'Turfly';

/**
 * The VenueSetting singleton, memoized per request via React's cache().
 * SiteHeader, SiteFooter, the admin nav, the login page, and the
 * homepage's hero copy all need it — without this, a single page render
 * (header + footer + page-specific content) would fire 2-3 identical
 * `SELECT * FROM "VenueSetting" WHERE id = 'singleton'` queries instead
 * of one. cache() only dedupes within a single request/render pass, so
 * this is safe even though the value can change between requests (an
 * admin editing it in /admin/pricing).
 */
export const getVenueSetting = cache(async () => {
  return prisma.venueSetting.findUnique({ where: { id: 'singleton' } });
});

/** Convenience for the common case of just wanting the display name with
 * its fallback applied. */
export async function getVenueName(): Promise<string> {
  const venue = await getVenueSetting();
  return venue?.venueName ?? DEFAULT_VENUE_NAME;
}
