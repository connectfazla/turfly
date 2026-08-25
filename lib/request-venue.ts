/**
 * Resolves WHICH venue a public request is for, from the host.
 *
 * `dhanmondi.turfly.xyz/book` and `turfly.xyz/book` are the same page serving
 * different businesses. Rather than rewriting to a `/v/[slug]/...` route tree
 * and duplicating every booking page under it, the pages stay where they are
 * and ask this. Same result, a fraction of the code, and no risk of the two
 * copies drifting apart.
 *
 * Falls back to Venue Zero on the bare domain, which is what keeps the
 * pre-SaaS venue's existing links and QR codes working.
 */
import { cache } from 'react';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { prisma } from './prisma';
import { resolveHost } from './subdomain';
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
  const host = (await headers()).get('host');
  const { venueSlug } = resolveHost(host, ROOT_DOMAIN);

  if (!venueSlug) {
    const id = await getDefaultVenueId();
    const venue = await prisma.venue.findUniqueOrThrow({
      where: { id },
      select: { id: true, slug: true, name: true },
    });
    return venue;
  }

  const venue = await prisma.venue.findUnique({
    where: { slug: venueSlug },
    select: { id: true, slug: true, name: true, isActive: true },
  });
  if (!venue || !venue.isActive) notFound();

  return { id: venue.id, slug: venue.slug, name: venue.name };
});

/** Convenience for the many call sites that only need the id. */
export async function getRequestVenueId(): Promise<string> {
  return (await getRequestVenue()).id;
}
