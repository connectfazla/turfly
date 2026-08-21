import { prisma } from '@/lib/prisma';
import { PEAK_SLOT_INDEXES } from '@/lib/slots';
import { PricingForm } from '@/components/admin/pricing-form';

export const dynamic = 'force-dynamic';

const NON_PEAK_SLOT = 0; // index 0 (00:00) is bookable and never peak

export default async function AdminPricingPage() {
  const [standardRow, peakRow, weekendStandardRow, weekendPeakRow] = await Promise.all([
    prisma.slotRule.findFirst({ where: { dayOfWeek: 1, slotIndex: NON_PEAK_SLOT } }),
    prisma.slotRule.findFirst({ where: { dayOfWeek: 1, slotIndex: PEAK_SLOT_INDEXES[0] } }),
    prisma.slotRule.findFirst({ where: { dayOfWeek: 5, slotIndex: NON_PEAK_SLOT } }),
    prisma.slotRule.findFirst({ where: { dayOfWeek: 5, slotIndex: PEAK_SLOT_INDEXES[0] } }),
  ]);

  return (
    <div>
      <h1 className="text-display text-text">Pricing</h1>
      <p className="mt-1 text-body text-text-muted">
        Prices apply by category across all matching slots. Not editable per row.
      </p>
      <div className="mt-6">
        <PricingForm
          current={{
            standard: Number(standardRow?.price ?? 0),
            peak: Number(peakRow?.price ?? 0),
            weekendStandard: Number(weekendStandardRow?.price ?? 0),
            weekendPeak: Number(weekendPeakRow?.price ?? 0),
          }}
        />
      </div>
    </div>
  );
}
