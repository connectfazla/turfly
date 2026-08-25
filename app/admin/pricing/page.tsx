/**
 * ROUTE: /admin/pricing — ADMIN-only (CLAUDE.md §7, enforced by
 * middleware.ts AND re-checked inside updatePricingAction /
 * updatePaymentSettingsAction).
 *
 * Prices are edited by category (noon flat, weekday/weekend afternoon,
 * weekday/weekend night), not per individual slot row - editing 112
 * SlotRule rows one at a time isn't a realistic UI. Saving bulk-updates
 * every matching row in one transaction (app/actions/pricing.ts). This
 * page also owns the payment settings (bKash number, advance amount,
 * verification window) — same "admin-only money config" reasoning.
 */
import { prisma } from '@/lib/prisma';
import { NOON_SLOT_INDEXES, PEAK_SLOT_INDEXES } from '@/lib/slots';
import { PricingForm } from '@/components/admin/pricing-form';
import { PaymentSettingsForm } from '@/components/admin/payment-settings-form';
import { requireRoleForPage } from '@/lib/auth/require-role-for-page';

export const dynamic = 'force-dynamic';

const AFTERNOON_SAMPLE_SLOT = 0; // 00:00 — bookable, never noon or peak

export default async function AdminPricingPage() {
  // OWNER-only route. This is the real gate: middleware only proves
  // somebody is signed in, and the sidebar hiding the link is cosmetic.
  const staff = await requireRoleForPage('OWNER');
  const { venueId } = staff;
  const [noonRow, afternoonRow, weekendAfternoonRow, nightRow, weekendNightRow, venue] = await Promise.all([
    prisma.slotRule.findFirst({ where: { venueId, dayOfWeek: 1, slotIndex: NOON_SLOT_INDEXES[0] } }),
    prisma.slotRule.findFirst({ where: { venueId, dayOfWeek: 1, slotIndex: AFTERNOON_SAMPLE_SLOT } }),
    prisma.slotRule.findFirst({ where: { venueId, dayOfWeek: 5, slotIndex: AFTERNOON_SAMPLE_SLOT } }),
    prisma.slotRule.findFirst({ where: { venueId, dayOfWeek: 1, slotIndex: PEAK_SLOT_INDEXES[0] } }),
    prisma.slotRule.findFirst({ where: { venueId, dayOfWeek: 5, slotIndex: PEAK_SLOT_INDEXES[0] } }),
    prisma.venue.findUnique({ where: { id: venueId } }),
  ]);

  return (
    <div className="flex flex-col gap-10">
      <div>
        <h1 className="text-display text-text">Pricing</h1>
        <p className="mt-1 text-body text-text-muted">
          Prices apply by category across all matching slots. Not editable per row.
        </p>
        <div className="mt-6">
          <PricingForm
            current={{
              noon: Number(noonRow?.price ?? 0),
              afternoon: Number(afternoonRow?.price ?? 0),
              weekendAfternoon: Number(weekendAfternoonRow?.price ?? 0),
              night: Number(nightRow?.price ?? 0),
              weekendNight: Number(weekendNightRow?.price ?? 0),
            }}
          />
        </div>
      </div>

      <div className="border-t border-border pt-8">
        <h2 className="text-heading text-text">Payment settings</h2>
        <p className="mt-1 text-body text-text-muted">
          The bKash number customers send the deposit to, what percentage of the price that deposit is, and
          how long an unverified claim holds its slot before it auto-releases.
        </p>
        <div className="mt-6">
          <PaymentSettingsForm
            current={{
              bkashNumber: venue?.bkashNumber ?? '',
              depositPercent: venue?.depositPercent ?? 30,
              paymentVerificationHours: venue?.paymentVerificationHours ?? 24,
            }}
          />
        </div>
      </div>
    </div>
  );
}
