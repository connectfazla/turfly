/**
 * The platform-operator gate. Separate from require-role.ts because it is a
 * different question: require-role asks "what may this person do at this
 * venue", this asks "is this person the platform operator", which no venue is
 * involved in.
 *
 * Membership is a PlatformAdmin row rather than an env var so it can be
 * granted or revoked without a redeploy.
 */
import { prisma } from '@/lib/prisma';
import { getSessionUser } from './session';
import { ForbiddenError, UnauthorizedError } from './require-role';

export interface SuperAdmin {
  /** User.id — AuditLog.actorId is an FK into User, so every action taken
   * here is attributable on the audit page. */
  userId: string;
  name: string;
  email: string;
}

export async function requireSuperAdmin(): Promise<SuperAdmin> {
  const session = await getSessionUser();
  if (!session) throw new UnauthorizedError();

  const { user } = session;
  if (!user.isActive || !user.emailVerifiedAt) throw new ForbiddenError();

  const admin = await prisma.platformAdmin.findUnique({ where: { userId: user.id } });
  if (!admin) throw new ForbiddenError();

  return { userId: user.id, name: user.name, email: user.email };
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
