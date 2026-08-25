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
import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { NOON_SLOT_INDEXES, PEAK_SLOT_INDEXES } from '@/lib/slots';
import { getActiveFields, getDefaultFieldId } from '@/lib/field';
import { PricingForm } from '@/components/admin/pricing-form';
import { PaymentSettingsForm } from '@/components/admin/payment-settings-form';
import { requireRoleForPage } from '@/lib/auth/require-role-for-page';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

const AFTERNOON_SAMPLE_SLOT = 0; // 00:00 — bookable, never noon or peak

interface Props {
  searchParams: Promise<{ field?: string }>;
}

export default async function AdminPricingPage({ searchParams }: Props) {
  // OWNER-only route. This is the real gate: middleware only proves
  // somebody is signed in, and the sidebar hiding the link is cosmetic.
  const staff = await requireRoleForPage('OWNER');
  const { venueId } = staff;
  const { field: fieldParam } = await searchParams;

  const fields = await getActiveFields(venueId);
  // Same "never trust, always re-derive" shape as /book/[date]'s own field
  // param — a hand-edited query string must not be able to point this page
  // at another venue's field id.
  const fieldId =
    (fieldParam && fields.some((f) => f.id === fieldParam) ? fieldParam : null) ??
    fields[0]?.id ??
    (await getDefaultFieldId(prisma, venueId));

  const [noonRow, afternoonRow, weekendAfternoonRow, nightRow, weekendNightRow, venue] = await Promise.all([
    prisma.slotRule.findFirst({ where: { fieldId, dayOfWeek: 1, slotIndex: NOON_SLOT_INDEXES[0] } }),
    prisma.slotRule.findFirst({ where: { fieldId, dayOfWeek: 1, slotIndex: AFTERNOON_SAMPLE_SLOT } }),
    prisma.slotRule.findFirst({ where: { fieldId, dayOfWeek: 5, slotIndex: AFTERNOON_SAMPLE_SLOT } }),
    prisma.slotRule.findFirst({ where: { fieldId, dayOfWeek: 1, slotIndex: PEAK_SLOT_INDEXES[0] } }),
    prisma.slotRule.findFirst({ where: { fieldId, dayOfWeek: 5, slotIndex: PEAK_SLOT_INDEXES[0] } }),
    prisma.venue.findUnique({ where: { id: venueId } }),
  ]);

  return (
    <div className="flex flex-col gap-10">
      <div>
        <h1 className="text-display text-text">Pricing</h1>
        <p className="mt-1 text-body text-text-muted">
          Prices apply by category across all matching slots. Not editable per row.
        </p>

        {fields.length > 1 ? (
          <nav aria-label="Choose a field" className="mt-4 flex flex-wrap gap-2">
            {fields.map((field) => {
              const isSelected = field.id === fieldId;
              return (
                <Link
                  key={field.id}
                  href={`/admin/pricing?field=${field.id}`}
                  aria-current={isSelected ? 'true' : undefined}
                  className={cn(
                    'rounded-full border px-3 py-1.5 text-caption font-medium transition-colors',
                    isSelected
                      ? 'border-accent bg-accent text-white'
                      : 'border-border bg-surface text-text hover:border-accent/50',
                  )}
                >
                  {field.name}
                </Link>
              );
            })}
          </nav>
        ) : null}

        <div className="mt-6">
          {/* key={fieldId}: forces a full remount on field switch, so
           * PricingForm's local "Saved."/error state resets cleanly
           * instead of a stale "Saved." banner surviving a navigation to
           * a field that was never touched — RHF's `values` prop already
           * re-syncs the number inputs themselves, but plain useState
           * (saved/serverError) has no equivalent auto-reset. */}
          <PricingForm
            key={fieldId}
            fieldId={fieldId}
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
