'use server';

import { revalidatePath } from 'next/cache';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireRole } from '@/lib/auth/require-role';
import { blockCustomerSchema, unblockCustomerSchema } from '@/lib/schemas/admin';
import type { ActionResult } from './bookings';

function fail(error: unknown): ActionResult<never> {
  if (error instanceof Error && (error.name === 'UnauthorizedError' || error.name === 'ForbiddenError')) {
    return { ok: false, error: error.message, code: error.name };
  }
  console.error(error);
  return { ok: false, error: 'Something went wrong. Please try again.' };
}

export async function blockCustomerAction(input: {
  customerId: string;
  reason: string;
}): Promise<ActionResult<{ isBlocked: boolean }>> {
  try {
    const staff = await requireRole('ADMIN', 'MODERATOR');
    const parsed = blockCustomerSchema.parse(input);

    const customer = await prisma.$transaction(async (tx) => {
      const before = await tx.customer.findUniqueOrThrow({ where: { id: parsed.customerId } });
      const updated = await tx.customer.update({
        where: { id: parsed.customerId },
        data: { isBlocked: true, blockedReason: parsed.reason },
      });
      await tx.auditLog.create({
        data: {
          actorId: staff.id,
          action: 'CUSTOMER_BLOCKED',
          entityType: 'Customer',
          entityId: updated.id,
          before: before as unknown as Prisma.InputJsonValue,
          after: updated as unknown as Prisma.InputJsonValue,
        },
      });
      return updated;
    });

    revalidatePath('/admin/customers');
    return { ok: true, data: { isBlocked: customer.isBlocked } };
  } catch (err) {
    return fail(err);
  }
}

export async function unblockCustomerAction(input: { customerId: string }): Promise<ActionResult<{ isBlocked: boolean }>> {
  try {
    const staff = await requireRole('ADMIN', 'MODERATOR');
    const parsed = unblockCustomerSchema.parse(input);

    const customer = await prisma.$transaction(async (tx) => {
      const before = await tx.customer.findUniqueOrThrow({ where: { id: parsed.customerId } });
      const updated = await tx.customer.update({
        where: { id: parsed.customerId },
        data: { isBlocked: false, blockedReason: null },
      });
      await tx.auditLog.create({
        data: {
          actorId: staff.id,
          action: 'CUSTOMER_UNBLOCKED',
          entityType: 'Customer',
          entityId: updated.id,
          before: before as unknown as Prisma.InputJsonValue,
          after: updated as unknown as Prisma.InputJsonValue,
        },
      });
      return updated;
    });

    revalidatePath('/admin/customers');
    return { ok: true, data: { isBlocked: customer.isBlocked } };
  } catch (err) {
    return fail(err);
  }
}
