/**
 * Resolves WHICH venue a staff request is operating on.
 *
 * Server Actions can't see route params, so unlike a page (which has
 * `[venueId]` in its URL) an action has to be told. Three sources, in
 * descending order of trustworthiness:
 *
 *   1. An explicit venueId in the action's own payload. The page already
 *      knows its venue and passes it down through the form, so this is the
 *      accurate one — and the only one that behaves correctly when a staff
 *      member has two venues open in two browser tabs.
 *   2. The `turfly_venue` cookie, set when a venue's dashboard is opened.
 *      Covers actions that haven't been threaded with an explicit id yet.
 *   3. The staff member's only venue, when they have exactly one. This is
 *      the single-venue case, which is every install today.
 *
 * NONE of these are trusted. Both 1 and 2 arrive from the browser and are
 * therefore attacker-controlled; `assertVenueAccess` re-derives the grant
 * from the database before any of them is returned. That is what makes a
 * forged cookie or a hand-edited form payload inert rather than a
 * cross-tenant hole.
 */
import { cookies } from 'next/headers';
import type { User } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { DEFAULT_VENUE_SLUG } from '@/lib/tenant';
import { ForbiddenError } from './require-role';

export const ACTIVE_VENUE_COOKIE = 'turfly_venue';

/** Thrown when a staff member has several venues and nothing said which. The
 * UI turns this into a venue picker rather than guessing — guessing here
 * would mean silently mutating the wrong venue's data. */
export class VenueNotSelectedError extends Error {
  constructor(message = 'Choose which venue you are working on.') {
    super(message);
    this.name = 'VenueNotSelectedError';
  }
}

/**
 * Every venue this person may act on: those under a tenant they own, plus
 * those they hold an active VenueStaff grant on. A platform admin gets
 * every venue on the platform.
 *
 * Only ACTIVE venues are listed — a deactivated venue is invisible to its
 * own staff, which is what makes Super Admin's deactivate switch actually
 * mean something.
 */
export async function accessibleVenueIds(user: User): Promise<string[]> {
  if (!user.clerkUserId) return [];

  const isPlatformAdmin = await prisma.platformAdmin.findUnique({
    where: { clerkUserId: user.clerkUserId },
    select: { clerkUserId: true },
  });

  const venues = await prisma.venue.findMany({
    where: isPlatformAdmin
      ? { isActive: true }
      : {
          isActive: true,
          OR: [
            { tenant: { ownerClerkUserId: user.clerkUserId } },
            { staff: { some: { userId: user.id, isActive: true } } },
          ],
        },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
  });
  return venues.map((v) => v.id);
}

/**
 * The gate. Returns the venueId only if this user genuinely has access to
 * it; throws otherwise. Every path in this module funnels through here —
 * do not add one that doesn't.
 */
export async function assertVenueAccess(user: User, venueId: string): Promise<string> {
  const allowed = await accessibleVenueIds(user);
  if (!allowed.includes(venueId)) throw new ForbiddenError();
  return venueId;
}

/**
 * @param explicitVenueId the venueId carried in the action payload, if the
 *   caller has been threaded with one yet. Preferred over the cookie.
 */
export async function resolveActiveVenueId(user: User, explicitVenueId?: string | null): Promise<string> {
  const allowed = await accessibleVenueIds(user);
  if (allowed.length === 0) throw new ForbiddenError();

  if (explicitVenueId) {
    if (!allowed.includes(explicitVenueId)) throw new ForbiddenError();
    return explicitVenueId;
  }

  const cookieVenueId = (await cookies()).get(ACTIVE_VENUE_COOKIE)?.value;
  // A cookie naming a venue this user can't reach is silently ignored
  // rather than fatal: it is the normal outcome of losing a grant, or of
  // signing in as someone else on a shared counter machine. Falling through
  // to the cases below recovers without an error page.
  if (cookieVenueId && allowed.includes(cookieVenueId)) return cookieVenueId;

  if (allowed.length === 1) return allowed[0]!;

  // TRANSITIONAL. /admin/* is still the single-venue dashboard: it has no
  // venue in its URL and no venue picker, so with nothing else to go on it
  // means Venue Zero, exactly as it did before this pass. Without this, the
  // platform operator — who can reach every venue on the platform — would
  // be locked out of /admin the moment a second venue existed, which is a
  // regression this pass would otherwise have introduced on the very day it
  // created the test venue.
  //
  // A real multi-venue owner (no access to the legacy default venue) still
  // falls through to VenueNotSelectedError, which is correct: they belong in
  // /dashboard/[venueId], and there is nothing sensible to guess for them.
  // Delete this branch when /dashboard/[venueId] replaces /admin/*.
  const defaultVenue = await prisma.venue.findUnique({
    where: { slug: DEFAULT_VENUE_SLUG },
    select: { id: true },
  });
  if (defaultVenue && allowed.includes(defaultVenue.id)) return defaultVenue.id;

  throw new VenueNotSelectedError();
}
