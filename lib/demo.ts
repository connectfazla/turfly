/**
 * The one place that knows what "the demo" means, so the public /demo page,
 * the login action, and the in-dashboard banner all agree.
 *
 * Deliberately just constants and a lookup — no logic a request could steer.
 * startDemoSessionAction (app/actions/demo.ts) takes only a role enum from
 * the visitor; every id it actually acts on comes from here or from the
 * database via that fixed slug, never from anything the browser sent.
 */
import { prisma } from './prisma';

export const DEMO_VENUE_SLUG = 'demo';

export type DemoRole = 'OWNER' | 'MANAGER' | 'BOOKIE';

export interface DemoVenue {
  venueId: string;
  tenantId: string;
  venueName: string;
  accounts: Record<DemoRole, { userId: string }>;
}

/**
 * Resolves the seeded demo venue and its three accounts, or null if
 * scripts/create-demo-venue.ts has not been run yet on this database.
 *
 * Re-derives the OWNER account from Tenant.ownerUserId and the MANAGER /
 * BOOKIE accounts from VenueStaff rather than hardcoding user ids — those
 * ids differ per database (dev, staging, production each ran the seed
 * script separately), and re-deriving them here means this file needs no
 * environment-specific configuration.
 */
export async function getDemoVenue(): Promise<DemoVenue | null> {
  const venue = await prisma.venue.findUnique({
    where: { slug: DEMO_VENUE_SLUG },
    select: {
      id: true,
      name: true,
      isActive: true,
      tenantId: true,
      tenant: { select: { isDemo: true, ownerUserId: true } },
      staff: { where: { isActive: true }, select: { userId: true, role: true } },
    },
  });

  // Every condition here matters: a venue that merely happens to be named
  // "demo" must never be treated as THE demo, and an inactive one must not
  // hand out sessions for a venue Super Admin has switched off.
  if (!venue || !venue.isActive || !venue.tenant.isDemo || !venue.tenant.ownerUserId) return null;

  const manager = venue.staff.find((s) => s.role === 'MANAGER');
  const bookie = venue.staff.find((s) => s.role === 'BOOKIE');
  if (!manager || !bookie) return null;

  return {
    venueId: venue.id,
    tenantId: venue.tenantId,
    venueName: venue.name,
    accounts: {
      OWNER: { userId: venue.tenant.ownerUserId },
      MANAGER: { userId: manager.userId },
      BOOKIE: { userId: bookie.userId },
    },
  };
}
