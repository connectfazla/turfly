import type { Role } from '@prisma/client';
import { auth } from '@/auth';

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

export interface StaffUser {
  id: string;
  email: string;
  name: string;
  role: Role;
}

/**
 * The re-check every staff Server Action must call — CLAUDE.md §7:
 * "Re-check the role inside every action — middleware alone is not
 * authorisation." Call with no roles to require any authenticated staff
 * session; pass specific roles to restrict further (e.g. `requireRole('ADMIN')`).
 */
export async function requireRole(...roles: Role[]): Promise<StaffUser> {
  const session = await auth();
  if (!session?.user) {
    throw new UnauthorizedError();
  }
  if (roles.length > 0 && !roles.includes(session.user.role)) {
    throw new ForbiddenError();
  }
  return {
    id: session.user.id,
    email: session.user.email ?? '',
    name: session.user.name ?? '',
    role: session.user.role,
  };
}
