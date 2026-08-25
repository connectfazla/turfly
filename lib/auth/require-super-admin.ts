/**
 * The platform-operator gate. Separate from require-role.ts because it is a
 * different question: require-role asks "what may this person do at this
 * venue", this asks "is this person the platform operator", which no venue is
 * involved in.
 *
 * Membership is a PlatformAdmin row rather than an env var so it can be
 * granted or revoked without a redeploy.
 */
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';
import { ForbiddenError, UnauthorizedError } from './require-role';

export interface SuperAdmin {
  clerkUserId: string;
  /** User.id — needed because AuditLog.actorId is an FK into User, not a bare
   * Clerk id. Null when the operator has no local User row, in which case
   * audit entries for their actions carry no actor. */
  userId: string | null;
  name: string | null;
  email: string | null;
}

export async function requireSuperAdmin(): Promise<SuperAdmin> {
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) throw new UnauthorizedError();

  const admin = await prisma.platformAdmin.findUnique({ where: { clerkUserId } });
  if (!admin) throw new ForbiddenError();

  // The operator's local User row, so their actions can be attributed on the
  // audit page. Looked up rather than required: platform admin status does not
  // depend on being staff anywhere.
  const user = await prisma.user.findUnique({
    where: { clerkUserId },
    select: { id: true, name: true, email: true },
  });

  return {
    clerkUserId,
    userId: user?.id ?? null,
    name: user?.name ?? admin.name,
    email: user?.email ?? admin.email,
  };
}

/** Non-throwing variant, for deciding whether to render a link. */
export async function isSuperAdmin(): Promise<boolean> {
  try {
    await requireSuperAdmin();
    return true;
  } catch {
    return false;
  }
}
