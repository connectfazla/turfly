'use server';

/** /admin/pricing is ADMIN-only (CLAUDE.md §7). Prices are edited by
 * category (standard / peak / weekend standard / weekend peak) and
 * bulk-applied across the 112 SlotRule rows — editing 112 rows one at a
 * time isn't a realistic UI. The maintenance slot is never touched. */
import { revalidatePath } from 'next/cache';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireRole } from '@/lib/auth/require-role';
import { pricingSchema, type PricingFormInput } from '@/lib/schemas/admin';
import { MAINTENANCE_SLOT, PEAK_SLOT_INDEXES, ALL_SLOT_INDEXES } from '@/lib/slots';
import { WEEKDAY_DAYS_OF_WEEK, WEEKEND_DAYS_OF_WEEK } from '@/lib/pricing';
import type { ActionResult } from './bookings';

const NON_PEAK_BOOKABLE_SLOTS = ALL_SLOT_INDEXES.filter(
  (i) => i !== MAINTENANCE_SLOT && !(PEAK_SLOT_INDEXES as readonly number[]).includes(i),
);

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

export async function updatePricingAction(input: PricingFormInput): Promise<ActionResult<{ ok: true }>> {
  try {
    const staff = await requireRole('ADMIN');
    const parsed = pricingSchema.parse(input);

    await prisma.$transaction(async (tx) => {
      await tx.slotRule.updateMany({
        where: { dayOfWeek: { in: [...WEEKDAY_DAYS_OF_WEEK] }, slotIndex: { in: NON_PEAK_BOOKABLE_SLOTS } },
        data: { price: parsed.standard },
      });
      await tx.slotRule.updateMany({
        where: { dayOfWeek: { in: [...WEEKDAY_DAYS_OF_WEEK] }, slotIndex: { in: [...PEAK_SLOT_INDEXES] } },
        data: { price: parsed.peak },
      });
      await tx.slotRule.updateMany({
        where: { dayOfWeek: { in: [...WEEKEND_DAYS_OF_WEEK] }, slotIndex: { in: NON_PEAK_BOOKABLE_SLOTS } },
        data: { price: parsed.weekendStandard },
      });
      await tx.slotRule.updateMany({
        where: { dayOfWeek: { in: [...WEEKEND_DAYS_OF_WEEK] }, slotIndex: { in: [...PEAK_SLOT_INDEXES] } },
        data: { price: parsed.weekendPeak },
      });
      await tx.auditLog.create({
        data: {
          actorId: staff.id,
          action: 'PRICING_UPDATED',
          entityType: 'SlotRule',
          entityId: 'bulk',
          after: parsed as unknown as Prisma.InputJsonValue,
        },
      });
    });

    revalidatePath('/admin/pricing');
    revalidatePath('/book');
    return { ok: true, data: { ok: true } };
  } catch (err) {
    return fail(err);
  }
}
