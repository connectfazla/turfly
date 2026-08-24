/**
 * The re-check every staff Server Action must call — CLAUDE.md §7.
 * Middleware is the first gate, but it is NOT authorisation: it only proves
 * *someone* is signed in. This resolves *who*, *at which venue*, and *with
 * what power*, against our own database.
 *
 * Authentication is Clerk's. Authorization is ours. `requireRole` never
 * denies on the basis of Clerk's `orgId`/`orgRole` — it reads
 * Tenant.ownerClerkUserId, VenueStaff and PlatformAdmin directly. That is a
 * deliberate choice: it means a lagging Clerk webhook, a failed
 * organization creation, or an unset active org can never lock an owner out
 * of their own dashboard. Clerk Organizations exist for hosted invitations
 * and org switching, nothing more.
 *
 * Call with no roles to require any staff access to the active venue; pass
 * roles to restrict further (e.g. `requireRole('OWNER')`).
 */
import { auth, currentUser } from '@clerk/nextjs/server';
import type { User, VenueStaffRole } from '@prisma/client';
import { prisma } from '@/lib/prisma';
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
 * OWNER is derived, never stored: it comes from Tenant.ownerClerkUserId (or
 * a PlatformAdmin row), which is why VenueStaffRole only has MANAGER and
 * BOOKIE. Keeping OWNER out of the enum also keeps every future migration
 * free of the "add an enum value and use it in the same transaction"
 * Postgres trap — see prisma/schema.prisma's bottom note.
 */
export type StaffRole = 'OWNER' | 'MANAGER' | 'BOOKIE';

export interface StaffUser {
  /** User.id — the FK anchor for Booking.createdById, AuditLog.actorId, etc. */
  id: string;
  clerkUserId: string;
  email: string;
  name: string;
  role: StaffRole;
  /** The venue this call is scoped to. Every venue-scoped query should filter on it. */
  venueId: string;
  tenantId: string;
}

/**
 * SECURITY-CRITICAL. Finds the local staff row for a Clerk account, binding
 * the two together on first sign-in.
 *
 * The binding path is the one place where an unauthenticated-to-us stranger
 * can become a known staff member, so it is deliberately narrow. It binds
 * ONLY when all of:
 *
 *   1. Clerk reports the account's primary email as `verified` — otherwise
 *      anyone could sign up claiming a staff member's address and inherit
 *      their role and audit identity.
 *   2. That address matches User.invitedEmail — NOT User.email. `email` is
 *      editable for display; if binding keyed on it, editing a display
 *      address would silently widen who may claim the row.
 *   3. The row is not already bound to some other Clerk account.
 *
 * Do not relax any of these three. Together they are the difference between
 * "an invited person claims their account" and "anyone who knows a staff
 * email address becomes that person".
 */
async function resolveStaffUser(clerkUserId: string): Promise<User> {
  const bound = await prisma.user.findUnique({ where: { clerkUserId } });
  if (bound) {
    if (!bound.isActive) throw new ForbiddenError('This staff account has been deactivated.');
    return bound;
  }

  const clerkUser = await currentUser();
  const primary = clerkUser?.emailAddresses.find((e) => e.id === clerkUser.primaryEmailAddressId);
  if (!primary || primary.verification?.status !== 'verified') {
    throw new ForbiddenError();
  }

  // updateMany, not update: the `clerkUserId: null` guard has to be part of
  // the WHERE so two concurrent first-sign-ins can't both bind the same row.
  const email = primary.emailAddress.toLowerCase();
  const claimed = await prisma.user.updateMany({
    where: { invitedEmail: email, clerkUserId: null, isActive: true },
    data: { clerkUserId, lastLoginAt: new Date() },
  });
  if (claimed.count !== 1) throw new ForbiddenError();

  return prisma.user.findUniqueOrThrow({ where: { clerkUserId } });
}

/** OWNER > MANAGER > BOOKIE, resolved for one specific venue. */
async function resolveEffectiveRole(user: User, venueId: string): Promise<{ role: StaffRole; tenantId: string }> {
  const venue = await prisma.venue.findUnique({
    where: { id: venueId },
    select: { id: true, tenantId: true, isActive: true, tenant: { select: { ownerClerkUserId: true } } },
  });
  if (!venue || !venue.isActive) throw new ForbiddenError('That venue is not available.');

  // Platform admin: full access to every venue, for support. Any action
  // taken this way still writes an AuditLog row under this user's id, so
  // the impersonation is visible after the fact.
  if (user.clerkUserId) {
    const platformAdmin = await prisma.platformAdmin.findUnique({ where: { clerkUserId: user.clerkUserId } });
    if (platformAdmin) return { role: 'OWNER', tenantId: venue.tenantId };
    if (venue.tenant.ownerClerkUserId === user.clerkUserId) {
      return { role: 'OWNER', tenantId: venue.tenantId };
    }
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
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) throw new UnauthorizedError();

  const user = await resolveStaffUser(clerkUserId);
  const activeVenueId = await resolveActiveVenueId(user, venueId);
  const { role, tenantId } = await resolveEffectiveRole(user, activeVenueId);

  if (roles.length > 0 && !roles.includes(role)) {
    throw new ForbiddenError();
  }

  return {
    id: user.id,
    clerkUserId,
    email: user.email,
    name: user.name,
    role,
    venueId: activeVenueId,
    tenantId,
  };
}
