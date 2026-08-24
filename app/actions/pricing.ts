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
import { requireRole } from '@/lib/auth/require-role';
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
 * in one transaction, then writes a single audit entry summarizing the
 * new values (entityId 'bulk', since no single row id applies). Noon
 * applies to every day of the week at once (it's flat) — the other four
 * split by weekday/weekend × afternoon/night. */
export async function updatePricingAction(input: PricingFormInput): Promise<ActionResult<{ ok: true }>> {
  try {
    const staff = await requireRole('OWNER');
    const parsed = pricingSchema.parse(input);

    // EVERY where clause below is venue-scoped. Without it these five
    // updateMany calls rewrote the price grid of every venue on the
    // platform — one owner editing their own prices silently repriced
    // every other owner's turf. The single highest-blast-radius bug the
    // multi-tenant audit found.
    const { venueId } = staff;

    await prisma.$transaction(async (tx) => {
      await tx.slotRule.updateMany({
        where: { venueId, slotIndex: { in: [...NOON_SLOT_INDEXES] } },
        data: { price: parsed.noon },
      });
      await tx.slotRule.updateMany({
        where: { venueId, dayOfWeek: { in: [...WEEKDAY_DAYS_OF_WEEK] }, slotIndex: { in: AFTERNOON_SLOTS } },
        data: { price: parsed.afternoon },
      });
      await tx.slotRule.updateMany({
        where: { venueId, dayOfWeek: { in: [...WEEKEND_DAYS_OF_WEEK] }, slotIndex: { in: AFTERNOON_SLOTS } },
        data: { price: parsed.weekendAfternoon },
      });
      await tx.slotRule.updateMany({
        where: { venueId, dayOfWeek: { in: [...WEEKDAY_DAYS_OF_WEEK] }, slotIndex: { in: [...PEAK_SLOT_INDEXES] } },
        data: { price: parsed.night },
      });
      await tx.slotRule.updateMany({
        where: { venueId, dayOfWeek: { in: [...WEEKEND_DAYS_OF_WEEK] }, slotIndex: { in: [...PEAK_SLOT_INDEXES] } },
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
