'use server';

/** /admin/pricing is ADMIN-only (CLAUDE.md §7). Prices are edited by
 * category (noon / afternoon / weekend afternoon / night / weekend night)
 * and bulk-applied across the 112 SlotRule rows — editing 112 rows one at
 * a time isn't a realistic UI. The maintenance slot is never touched.
 * This file also owns the payment settings (bKash number, advance
 * amount, verification window) — same page, same "admin-only money
 * config" reasoning. */
import { revalidatePath } from 'next/cache';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { ForbiddenError, requireRole } from '@/lib/auth/require-role';
import {
  paymentSettingsSchema,
  pricingSchema,
  type PaymentSettingsFormInput,
  type PricingFormInput,
} from '@/lib/schemas/admin';
import { MAINTENANCE_SLOT, NOON_SLOT_INDEXES, PEAK_SLOT_INDEXES, ALL_SLOT_INDEXES } from '@/lib/slots';
import { WEEKDAY_DAYS_OF_WEEK, WEEKEND_DAYS_OF_WEEK } from '@/lib/pricing';
import type { ActionResult } from './bookings';

const AFTERNOON_SLOTS = ALL_SLOT_INDEXES.filter(
  (i) =>
    i !== MAINTENANCE_SLOT &&
    !(PEAK_SLOT_INDEXES as readonly number[]).includes(i) &&
    !(NOON_SLOT_INDEXES as readonly number[]).includes(i),
);

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

/** Bulk-applies the 5 category prices across every matching SlotRule row
 * for ONE FIELD, in one transaction, then writes a single audit entry
 * summarizing the new values (entityId 'bulk', since no single row id
 * applies). Noon applies to every day of the week at once (it's flat) —
 * the other four split by weekday/weekend × afternoon/night.
 *
 * `fieldId` is a separate argument, not part of the Zod-validated form
 * input — it's which record the owner is editing (chosen via
 * app/admin/pricing/page.tsx's field selector when a venue has more than
 * one), not data they typed into the form.
 */
export async function updatePricingAction(
  fieldId: string,
  input: PricingFormInput,
): Promise<ActionResult<{ ok: true }>> {
  try {
    const staff = await requireRole('OWNER');
    const parsed = pricingSchema.parse(input);
    const { venueId } = staff;

    // The field genuinely belongs to the caller's venue - without this, a
    // hand-edited fieldId could bulk-reprice ANY venue's field, not just
    // the caller's own. Same shape as the venueId scoping this action
    // already had (the highest-blast-radius bug the original tenant-
    // isolation audit found) — one field's worth of the same class of bug.
    const field = await prisma.field.findFirst({ where: { id: fieldId, venueId }, select: { id: true } });
    if (!field) throw new ForbiddenError('That field is not available.');

    await prisma.$transaction(async (tx) => {
      await tx.slotRule.updateMany({
        where: { fieldId, slotIndex: { in: [...NOON_SLOT_INDEXES] } },
        data: { price: parsed.noon },
      });
      await tx.slotRule.updateMany({
        where: { fieldId, dayOfWeek: { in: [...WEEKDAY_DAYS_OF_WEEK] }, slotIndex: { in: AFTERNOON_SLOTS } },
        data: { price: parsed.afternoon },
      });
      await tx.slotRule.updateMany({
        where: { fieldId, dayOfWeek: { in: [...WEEKEND_DAYS_OF_WEEK] }, slotIndex: { in: AFTERNOON_SLOTS } },
        data: { price: parsed.weekendAfternoon },
      });
      await tx.slotRule.updateMany({
        where: { fieldId, dayOfWeek: { in: [...WEEKDAY_DAYS_OF_WEEK] }, slotIndex: { in: [...PEAK_SLOT_INDEXES] } },
        data: { price: parsed.night },
      });
      await tx.slotRule.updateMany({
        where: { fieldId, dayOfWeek: { in: [...WEEKEND_DAYS_OF_WEEK] }, slotIndex: { in: [...PEAK_SLOT_INDEXES] } },
        data: { price: parsed.weekendNight },
      });
      await tx.auditLog.create({
        data: {
          actorId: staff.id,
          action: 'PRICING_UPDATED',
          entityType: 'SlotRule',
          entityId: 'bulk',
          venueId,
          tenantId: staff.tenantId,
          after: { fieldId, ...parsed } as unknown as Prisma.InputJsonValue,
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

/** Updates the bKash wallet number customers pay the deposit to, the
 * deposit percentage, and the auto-expiry window for unverified claims —
 * all on the Venue row (VenueSetting's replacement — see
 * prisma/schema.prisma), never hard-coded in source (CLAUDE.md §8: "no
 * secrets in code").
 *
 * Writes to the CALLER's venue. It used to write to getDefaultVenueId(),
 * which meant any owner saving this form edited Venue Zero's bKash number —
 * i.e. redirected another business's customer payments to their own wallet.
 * */
export async function updatePaymentSettingsAction(
  input: PaymentSettingsFormInput,
): Promise<ActionResult<{ ok: true }>> {
  try {
    const staff = await requireRole('OWNER');
    const parsed = paymentSettingsSchema.parse(input);
    const { venueId } = staff;

    await prisma.$transaction(async (tx) => {
      const before = await tx.venue.findUnique({ where: { id: venueId } });
      await tx.venue.update({
        where: { id: venueId },
        data: {
          bkashNumber: parsed.bkashNumber,
          depositPercent: parsed.depositPercent,
          paymentVerificationHours: parsed.paymentVerificationHours,
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: staff.id,
          action: 'PAYMENT_SETTINGS_UPDATED',
          entityType: 'Venue',
          entityId: venueId,
          venueId,
          tenantId: staff.tenantId,
          before: before ? (before as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
          after: parsed as unknown as Prisma.InputJsonValue,
        },
      });
    });

    revalidatePath('/admin/pricing');
    revalidatePath('/book/confirm');
    return { ok: true, data: { ok: true } };
  } catch (err) {
    return fail(err);
  }
}
