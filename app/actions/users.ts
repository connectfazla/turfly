'use server';

/** /admin/users is ADMIN-only (CLAUDE.md §7). */
import { revalidatePath } from 'next/cache';
import bcrypt from 'bcryptjs';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireRole } from '@/lib/auth/require-role';
import {
  changeUserRoleSchema,
  createUserSchema,
  setUserActiveSchema,
  type CreateUserFormInput,
} from '@/lib/schemas/admin';
import type { ActionResult } from './bookings';

const BCRYPT_COST = 12;

/** Maps any thrown error into a safe, user-facing ActionResult. */
function fail(error: unknown): ActionResult<never> {
  if (error instanceof Error && (error.name === 'UnauthorizedError' || error.name === 'ForbiddenError')) {
    return { ok: false, error: error.message, code: error.name };
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    return { ok: false, error: 'A user with that email already exists.' };
  }
  if (error instanceof Error && error.name === 'ZodError') {
    return { ok: false, error: 'Please check the form and try again.' };
  }
  console.error(error);
  return { ok: false, error: 'Something went wrong. Please try again.' };
}

/** Creates a new staff account. Password is hashed with the same bcrypt
 * cost (12) as auth.ts's login check and prisma/seed.ts's seeded users. */
export async function createUserAction(input: CreateUserFormInput): Promise<ActionResult<{ id: string }>> {
  try {
    const staff = await requireRole('ADMIN');
    const parsed = createUserSchema.parse(input);

    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email: parsed.email,
          name: parsed.name,
          role: parsed.role,
          passwordHash: await bcrypt.hash(parsed.password, BCRYPT_COST),
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: staff.id,
          action: 'USER_CREATED',
          entityType: 'User',
          entityId: created.id,
          after: { email: created.email, name: created.name, role: created.role },
        },
      });
      return created;
    });

    revalidatePath('/admin/users');
    return { ok: true, data: { id: user.id } };
  } catch (err) {
    return fail(err);
  }
}

/** Enable/disable a staff account. Refuses to let an admin disable their
 * own account, so nobody can accidentally lock themselves out. */
export async function setUserActiveAction(input: { userId: string; isActive: boolean }): Promise<ActionResult<{ isActive: boolean }>> {
  try {
    const staff = await requireRole('ADMIN');
    const parsed = setUserActiveSchema.parse(input);

    if (parsed.userId === staff.id && !parsed.isActive) {
      return { ok: false, error: "You can't disable your own account." };
    }

    const user = await prisma.$transaction(async (tx) => {
      const before = await tx.user.findUniqueOrThrow({ where: { id: parsed.userId } });
      const updated = await tx.user.update({ where: { id: parsed.userId }, data: { isActive: parsed.isActive } });
      await tx.auditLog.create({
        data: {
          actorId: staff.id,
          action: parsed.isActive ? 'USER_ENABLED' : 'USER_DISABLED',
          entityType: 'User',
          entityId: updated.id,
          before: { isActive: before.isActive },
          after: { isActive: updated.isActive },
        },
      });
      return updated;
    });

    revalidatePath('/admin/users');
    return { ok: true, data: { isActive: user.isActive } };
  } catch (err) {
    return fail(err);
  }
}

/** Changes a staff account's role. Refuses to let an admin demote their
 * own account away from ADMIN, for the same self-lockout reason as
 * setUserActiveAction above. */
export async function changeUserRoleAction(input: { userId: string; role: 'ADMIN' | 'MODERATOR' }): Promise<ActionResult<{ role: string }>> {
  try {
    const staff = await requireRole('ADMIN');
    const parsed = changeUserRoleSchema.parse(input);

    if (parsed.userId === staff.id && parsed.role !== 'ADMIN') {
      return { ok: false, error: "You can't remove your own admin role." };
    }

    const user = await prisma.$transaction(async (tx) => {
      const before = await tx.user.findUniqueOrThrow({ where: { id: parsed.userId } });
      const updated = await tx.user.update({ where: { id: parsed.userId }, data: { role: parsed.role } });
      await tx.auditLog.create({
        data: {
          actorId: staff.id,
          action: 'USER_ROLE_CHANGED',
          entityType: 'User',
          entityId: updated.id,
          before: { role: before.role },
          after: { role: updated.role },
        },
      });
      return updated;
    });

    revalidatePath('/admin/users');
    return { ok: true, data: { role: user.role } };
  } catch (err) {
    return fail(err);
  }
}
