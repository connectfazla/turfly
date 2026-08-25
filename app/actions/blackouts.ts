'use server';

/**
 * Blackout Server Actions. CLAUDE.md §4 order + §5 invariant #8: "Blackouts
 * override availability. Warn staff if a blackout would orphan existing
 * bookings" — warn, not block, so createBlackoutAction always proceeds;
 * previewBlackoutImpactAction is the read the client calls first to show
 * that warning before the staff member confirms.
 */
import { revalidatePath } from 'next/cache';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { dateOnly } from '@/lib/availability-service';
import { getDefaultFieldId } from '@/lib/field';
import { requireRole } from '@/lib/auth/require-role';
import { parseDateParam } from '@/lib/format';
import { slotLabel, type SlotIndex } from '@/lib/slots';
import { createBlackoutSchema, deleteBlackoutSchema, type CreateBlackoutFormInput } from '@/lib/schemas/admin';
import type { ActionResult } from './bookings';

/** Maps any thrown error into a safe, user-facing ActionResult. */
function fail(error: unknown): ActionResult<never> {
  if (error instanceof Error && (error.name === 'UnauthorizedError' || error.name === 'ForbiddenError')) {
    return { ok: false, error: error.message, code: error.name };
  }
  if (error instanceof Error && error.name === 'ZodError') {
    return { ok: false, error: 'Please check the form and try again.' };
  }
  console.error(error);
  return { ok: false, error: 'Something went wrong. Please try again.' };
}

export interface AffectedBooking {
  reference: string;
  customerName: string;
  slotLabel: string;
}

/** Read-only: lists live bookings a proposed blackout would affect,
 * without creating anything. The client shows this list and asks staff
 * to confirm before actually calling createBlackoutAction. */
export async function previewBlackoutImpactAction(input: {
  date: string;
  slotIndex: number | '';
}): Promise<ActionResult<{ affected: AffectedBooking[] }>> {
  try {
    const staff = await requireRole();
    const date = parseDateParam(input.date);
    if (!date) throw new Error('Invalid date');
    const day = dateOnly(date);
    // Same default-field fallback createBlackoutAction below uses — this
    // preview must scope by the exact field the blackout will actually
    // land on, not the whole venue, or it warns about bookings on fields
    // the blackout would never touch.
    const fieldId = await getDefaultFieldId(prisma, staff.venueId);

    // venueId is not optional here: this returns customer NAMES, so without
    // it a blackout preview at one venue listed other tenants' customers.
    const bookings = await prisma.booking.findMany({
      where: {
        venueId: staff.venueId,
        fieldId,
        date: day,
        status: { in: ['HELD', 'CONFIRMED', 'COMPLETED'] },
        ...(input.slotIndex !== '' ? { slotIndex: input.slotIndex } : {}),
      },
      include: { customer: true },
    });

    return {
      ok: true,
      data: {
        affected: bookings.map((b) => ({
          reference: b.reference,
          customerName: b.customer.fullName,
          slotLabel: slotLabel(b.slotIndex as SlotIndex),
        })),
      },
    };
  } catch (err) {
    return fail(err);
  }
}

/** Creates the blackout regardless of what previewBlackoutImpactAction
 * found - "warn, not block" (CLAUDE.md §2 invariant 8). A P2002 here
 * means an identical (date, slotIndex) blackout already exists. */
export async function createBlackoutAction(
  input: CreateBlackoutFormInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    const staff = await requireRole();
    const parsed = createBlackoutSchema.parse(input);
    const date = parseDateParam(parsed.date);
    if (!date) throw new Error('Invalid date');
    const day = dateOnly(date);

    // The caller's own venue, not the default one. Blackout.venueId is
    // filtered on by fetchDayAvailability, so this must be set — and must be
    // right — for a new blackout to close the intended venue's slot rather
    // than someone else's.
    const { venueId } = staff;
    // Defaults to the venue's default field until admin/blackouts grows a
    // field picker — same documented gap as the counter-booking form
    // (CLAUDE.md §11): a single-field venue (still nearly all of them)
    // sees zero change.
    const fieldId = await getDefaultFieldId(prisma, venueId);

    const blackout = await prisma.$transaction(async (tx) => {
      const created = await tx.blackout.create({
        data: {
          date: day,
          slotIndex: parsed.slotIndex,
          reason: parsed.reason,
          createdById: staff.id,
          venueId,
          fieldId,
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: staff.id,
          action: 'BLACKOUT_CREATED',
          entityType: 'Blackout',
          entityId: created.id,
          venueId,
          tenantId: staff.tenantId,
          after: created as unknown as Prisma.InputJsonValue,
        },
      });
      return created;
    });

    revalidatePath('/admin/blackouts');
    revalidatePath('/admin');
    revalidatePath('/book');
    return { ok: true, data: { id: blackout.id } };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return { ok: false, error: 'A blackout already exists for that date and slot.' };
    }
    return fail(err);
  }
}

/** Removes a blackout, immediately making its slot(s) bookable again. */
export async function deleteBlackoutAction(input: { id: string }): Promise<ActionResult<{ id: string }>> {
  try {
    const staff = await requireRole();
    const parsed = deleteBlackoutSchema.parse(input);

    await prisma.$transaction(async (tx) => {
      // findFirst with venueId in the WHERE, not findUnique by id: staff at
      // one venue must not be able to delete another venue's blackout by
      // substituting an id, which would silently reopen a slot that venue
      // had deliberately closed.
      const existing = await tx.blackout.findFirst({ where: { id: parsed.id, venueId: staff.venueId } });
      if (!existing) throw new Error('Blackout not found');
      await tx.blackout.delete({ where: { id: existing.id } });
      await tx.auditLog.create({
        data: {
          actorId: staff.id,
          action: 'BLACKOUT_DELETED',
          entityType: 'Blackout',
          entityId: existing.id,
          venueId: staff.venueId,
          tenantId: staff.tenantId,
          before: existing as unknown as Prisma.InputJsonValue,
        },
      });
    });

    revalidatePath('/admin/blackouts');
    revalidatePath('/admin');
    revalidatePath('/book');
    return { ok: true, data: { id: parsed.id } };
  } catch (err) {
    return fail(err);
  }
}
