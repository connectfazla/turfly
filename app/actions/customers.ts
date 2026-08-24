'use server';

/**
 * Customer Server Actions, used by /admin/customers. Blocking/unblocking
 * doesn't go through lib/booking-engine.ts (it's not a Booking mutation)
 * but still follows the same shape: role check, schema parse, transaction
 * with an audit row, then revalidate.
 */
import { revalidatePath } from 'next/cache';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { ForbiddenError, requireRole } from '@/lib/auth/require-role';
import { blockCustomerSchema, unblockCustomerSchema } from '@/lib/schemas/admin';
import type { ActionResult } from './bookings';

/** Maps any thrown error into a safe, user-facing ActionResult. */
function fail(error: unknown): ActionResult<never> {
  if (error instanceof Error && (error.name === 'UnauthorizedError' || error.name === 'ForbiddenError')) {
    return { ok: false, error: error.message, code: error.name };
  }
  console.error(error);
  return { ok: false, error: 'Something went wrong. Please try again.' };
}

/**
 * Refuses a customer who has never booked at the caller's venue.
 *
 * Customer is deliberately a GLOBAL table (phone-unique, so a customer's
 * "my bookings" can span venues — see prisma/schema.prisma). That makes an
 * unscoped customerId a cross-tenant handle: without this, staff at one
 * venue could block, unblock, or read any customer on the platform,
 * including people who have never been near their turf.
 *
 * "Has booked here" is the narrowest defensible definition of "yours".
 */
async function assertCustomerOfVenue(customerId: string, venueId: string): Promise<void> {
  const found = await prisma.customer.findFirst({
    where: { id: customerId, bookings: { some: { venueId } } },
    select: { id: true },
  });
  if (!found) throw new ForbiddenError('That customer is not available.');
}

/** Blocks a customer from booking online (CustomerBlockedError in
 * lib/booking-engine.ts is what actually enforces this at booking time).
 * Staff can still book for a blocked customer at the counter.
 *
 * KNOWN LIMITATION, deliberately left visible rather than silently scoped:
 * WHO can be blocked is now venue-scoped (assertCustomerOfVenue above), but
 * the EFFECT of the block is still global — Customer.isBlocked is one
 * column on a shared row, so blocking a customer here blocks them at every
 * venue on the platform. Fixing that properly needs a
 * VenueCustomerBlock(venueId, customerId, ...) table that
 * upsertCustomer() checks per venue, which is a schema + booking-engine
 * change and a product decision (should the global flag survive as a
 * platform-level abuse switch for Super Admin?). Not something to slip
 * into an isolation pass unannounced. */
export async function blockCustomerAction(input: {
  customerId: string;
  reason: string;
}): Promise<ActionResult<{ isBlocked: boolean }>> {
  try {
    const staff = await requireRole('OWNER', 'MANAGER');
    const parsed = blockCustomerSchema.parse(input);
    await assertCustomerOfVenue(parsed.customerId, staff.venueId);

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
          venueId: staff.venueId,
          tenantId: staff.tenantId,
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

/** Reverses blockCustomerAction. */
export async function unblockCustomerAction(input: { customerId: string }): Promise<ActionResult<{ isBlocked: boolean }>> {
  try {
    const staff = await requireRole('OWNER', 'MANAGER');
    const parsed = unblockCustomerSchema.parse(input);
    await assertCustomerOfVenue(parsed.customerId, staff.venueId);

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
          venueId: staff.venueId,
          tenantId: staff.tenantId,
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
