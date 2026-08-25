/**
 * The re-check every staff Server Action must call — CLAUDE.md §7.
 * Middleware is the first gate, but it is NOT authorisation: it only proves
 * *someone* is signed in. This resolves *who*, *at which venue*, and *with
 * what power*.
 *
 * Authentication and authorization are both ours now. Ownership comes from
 * Tenant.ownerUserId, staff roles from VenueStaff, platform access from
 * PlatformAdmin — all keyed on User.id, the one identity every other FK in
 * the schema already points at.
 *
 * Call with no roles to require any staff access to the active venue; pass
 * roles to restrict further (e.g. `requireRole('OWNER')`).
 */
import type { User, VenueStaffRole } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { getSessionUser } from './session';
import { resolveActiveVenueId } from './active-venue';

export class UnauthorizedError extends Error {
  constructor(message = 'You must be signed in.') {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends Error {
  constructor(message = 'You do not have permission to do that.') {
    super(message);
    this.name = 'ForbiddenError';
  }
}

/**
 * OWNER is derived, never stored: it comes from Tenant.ownerUserId (or
 * a PlatformAdmin row), which is why VenueStaffRole only has MANAGER and
 * BOOKIE. Keeping OWNER out of the enum also keeps every future migration
 * free of the "add an enum value and use it in the same transaction"
 * Postgres trap — see prisma/schema.prisma's bottom note.
 */
export type StaffRole = 'OWNER' | 'MANAGER' | 'BOOKIE';

export interface StaffUser {
  /** User.id — the FK anchor for Booking.createdById, AuditLog.actorId, etc. */
  id: string;
  email: string;
  name: string;
  role: StaffRole;
  /** The venue this call is scoped to. Every venue-scoped query should filter on it. */
  venueId: string;
  tenantId: string;
}

/** OWNER > MANAGER > BOOKIE, resolved for one specific venue. */
async function resolveEffectiveRole(user: User, venueId: string): Promise<{ role: StaffRole; tenantId: string }> {
  const venue = await prisma.venue.findUnique({
    where: { id: venueId },
    select: { id: true, tenantId: true, isActive: true, tenant: { select: { ownerUserId: true } } },
  });
  if (!venue || !venue.isActive) throw new ForbiddenError('That venue is not available.');

  // Platform admin: full access to every venue, for support. Any action taken
  // this way still writes an AuditLog row under this user's id, so the
  // impersonation is visible after the fact.
  const platformAdmin = await prisma.platformAdmin.findUnique({ where: { userId: user.id } });
  if (platformAdmin) return { role: 'OWNER', tenantId: venue.tenantId };

  if (venue.tenant.ownerUserId === user.id) {
    return { role: 'OWNER', tenantId: venue.tenantId };
  }

  const grant = await prisma.venueStaff.findUnique({
    where: { venueId_userId: { venueId, userId: user.id } },
    select: { role: true, isActive: true },
  });
  if (!grant || !grant.isActive) throw new ForbiddenError();

  const role: Record<VenueStaffRole, StaffRole> = { MANAGER: 'MANAGER', BOOKIE: 'BOOKIE' };
  return { role: role[grant.role], tenantId: venue.tenantId };
}

/**
 * Requires staff access to the caller's ACTIVE venue (see
 * lib/auth/active-venue.ts for how that's resolved). Call with no arguments
 * to accept any staff role, or pass the roles allowed.
 */
export async function requireRole(...roles: StaffRole[]): Promise<StaffUser> {
  return requireRoleForVenue(null, ...roles);
}

/**
 * The same check, scoped to a venue the caller already knows — from a
 * `[venueId]` route segment, or from a form payload that carried it.
 *
 * Prefer this wherever the venue is known. It is immune to the one real
 * weakness of cookie-based resolution: two browser tabs on two venues share
 * one cookie, so a mutation fired from the older tab can otherwise land on
 * whichever venue was opened last.
 *
 * `venueId` is NOT trusted — it comes from the browser. It is validated
 * against the caller's actual grants before anything is returned.
 */
export async function requireRoleForVenue(
  venueId: string | null,
  ...roles: StaffRole[]
): Promise<StaffUser> {
  const session = await getSessionUser();
  if (!session) throw new UnauthorizedError();

  const { user } = session;
  // Belt and braces: getSessionUser already refuses an inactive user, but a
  // guard this cheap on the path that decides every permission is worth
  // repeating rather than depending on a caller staying correct.
  if (!user.isActive) throw new ForbiddenError('This staff account has been deactivated.');
  if (!user.emailVerifiedAt) throw new ForbiddenError('Please verify your email address first.');

  const activeVenueId = await resolveActiveVenueId(user, venueId);
  const { role, tenantId } = await resolveEffectiveRole(user, activeVenueId);

  if (roles.length > 0 && !roles.includes(role)) {
    throw new ForbiddenError();
  }

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role,
    venueId: activeVenueId,
    tenantId,
  };
}
