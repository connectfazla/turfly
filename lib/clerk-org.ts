/**
 * Clerk Organization creation, kept deliberately OUT of the provisioning
 * transaction.
 *
 * Our database is the source of truth for authorization (CLAUDE.md §11), so
 * a tenant whose Clerk org failed to create is FULLY FUNCTIONAL: requireRole
 * resolves ownership from Tenant.ownerClerkUserId, never from Clerk's orgId.
 * The only thing unavailable is hosted staff invitations. That is why this
 * runs after the commit and is allowed to fail — the alternative orderings
 * are both worse:
 *
 *  - Clerk first, then the DB: a failed commit leaves an orphan organization
 *    with no tenant behind it, which the organization.created webhook would
 *    race to interpret.
 *  - Both in one transaction: impossible. Clerk is an HTTP call; it cannot
 *    be rolled back by Postgres.
 *
 * So: commit the business, then try to create the org, then repair lazily.
 */
import { clerkClient } from '@clerk/nextjs/server';
import { prisma } from './prisma';

/**
 * IDEMPOTENT. Ensures the tenant has a Clerk Organization, creating one only
 * if it genuinely has none.
 *
 * Adopts before creating: if a previous attempt created the org but crashed
 * before writing clerkOrgId, the org exists and this finds it by name among
 * the owner's memberships rather than creating a duplicate. That is the
 * failure this function exists for.
 *
 * Returns null when Organizations are not enabled on the instance, or when
 * Clerk is unreachable — both are non-fatal by design. Callers show a banner;
 * they do not block the owner.
 */
export async function ensureClerkOrg(tenantId: string): Promise<string | null> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true, name: true, clerkOrgId: true, ownerClerkUserId: true },
  });
  if (!tenant?.ownerClerkUserId) return null;
  if (tenant.clerkOrgId) return tenant.clerkOrgId;

  try {
    const clerk = await clerkClient();

    // Adopt an existing org before creating one.
    const memberships = await clerk.users.getOrganizationMembershipList({
      userId: tenant.ownerClerkUserId,
    });
    const adopted = memberships.data.find((m) => m.organization.name === tenant.name);

    const orgId =
      adopted?.organization.id ??
      (
        await clerk.organizations.createOrganization({
          name: tenant.name,
          createdBy: tenant.ownerClerkUserId,
        })
      ).id;

    // updateMany with a clerkOrgId: null guard, so two concurrent repairs
    // cannot both write — and the loser simply finds it set next time.
    await prisma.tenant.updateMany({
      where: { id: tenant.id, clerkOrgId: null },
      data: { clerkOrgId: orgId },
    });
    return orgId;
  } catch (err) {
    // Deliberately swallowed. The business works without this; logging it is
    // the correct response, blocking the owner is not.
    console.error(`[clerk-org] could not ensure organization for tenant ${tenantId}:`, err);
    return null;
  }
}
