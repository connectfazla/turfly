/**
 * Report aggregation — shared by /admin/reports and its CSV export route,
 * so both read the exact same numbers (never a second implementation).
 *
 * "Revenue" = amountPaid summed over CONFIRMED + COMPLETED + NO_SHOW —
 * money actually collected, whether or not the customer showed up.
 * CANCELLED/EXPIRED/HELD carry no revenue.
 *
 * Utilization is an estimate: (occupied slots) / (days in range x 15
 * bookable slots). It does not subtract blackouts from the denominator —
 * good enough for the qualitative "which slots are dead" read this report
 * is for (BUILD_PLAN.md step 7's demo script), not a billing figure.
 */
import { prisma } from './prisma';
import { dateOnly } from './availability-service';
import { BOOKABLE_SLOT_INDEXES, type SlotIndex } from './slots';

export type Granularity = 'day' | 'week' | 'month';

const REVENUE_STATUSES = ['CONFIRMED', 'COMPLETED', 'NO_SHOW'] as const;

export interface RevenueBucket {
  key: string; // sort/group key
  label: string; // display label
  revenue: number;
  count: number;
}

export interface HeatMapCell {
  dayOfWeek: number; // 0..6
  slotIndex: SlotIndex;
  count: number;
}

export interface ReportSummary {
  from: Date;
  to: Date;
  totalBookings: number;
  totalRevenue: number;
  totalNoShows: number;
  utilizationPercent: number;
  priorTotalRevenue: number;
  priorTotalBookings: number;
  revenueByBucket: RevenueBucket[];
  heatMap: HeatMapCell[];
  rows: ReportRow[];
}

export interface ReportRow {
  reference: string;
  date: Date;
  slotIndex: number;
  status: string;
  customerName: string;
  phone: string;
  priceAmount: number;
  amountPaid: number;
}

/** Inclusive day count between two UTC-midnight dates (e.g. Mon..Mon = 1,
 * Mon..Tue = 2). Used both for the range itself and to size the matching
 * "prior period" comparison window. */
function daysInRange(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1;
}

/** Groups a booking's date into a day/week/month bucket. `key` sorts
 * correctly as a plain string; `label` is what the chart actually shows. */
function bucketKey(date: Date, granularity: Granularity): { key: string; label: string } {
  if (granularity === 'day') {
    const key = date.toISOString().slice(0, 10);
    return { key, label: date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) };
  }
  if (granularity === 'week') {
    const weekStart = new Date(date);
    weekStart.setUTCDate(weekStart.getUTCDate() - weekStart.getUTCDay());
    const key = weekStart.toISOString().slice(0, 10);
    return { key, label: `Wk of ${weekStart.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}` };
  }
  const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
  const label = date.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
  return { key, label };
}

/** The one function behind /admin/reports and its CSV export - see the
 * module doc comment at the top of this file for what "revenue" and
 * "utilisation" mean here.
 *
 * `venueId` is REQUIRED, not optional with a default. It reports revenue,
 * so an unscoped call is a disclosure of another business's takings, and a
 * parameter that can be forgotten is one that will be. Making it required
 * means the compiler finds every caller instead of some of them silently
 * summing the whole platform. */
export async function buildReport(
  venueId: string,
  from: Date,
  to: Date,
  granularity: Granularity,
): Promise<ReportSummary> {
  const rangeFrom = dateOnly(from);
  const rangeTo = dateOnly(to);
  const rangeLength = daysInRange(rangeFrom, rangeTo);

  const priorTo = new Date(rangeFrom);
  priorTo.setUTCDate(priorTo.getUTCDate() - 1);
  const priorFrom = new Date(priorTo);
  priorFrom.setUTCDate(priorFrom.getUTCDate() - (rangeLength - 1));

  const [bookings, priorBookings, noShowCount, fieldCount] = await Promise.all([
    prisma.booking.findMany({
      where: { venueId, date: { gte: rangeFrom, lte: rangeTo }, status: { in: [...REVENUE_STATUSES] } },
      include: { customer: true },
      orderBy: { date: 'asc' },
    }),
    prisma.booking.findMany({
      where: { venueId, date: { gte: priorFrom, lte: priorTo }, status: { in: [...REVENUE_STATUSES] } },
      select: { amountPaid: true },
    }),
    prisma.booking.count({ where: { venueId, date: { gte: rangeFrom, lte: rangeTo }, status: 'NO_SHOW' } }),
    // Multi-field pass: revenue and booking counts are correct sums across
    // every field at this venue (a venue-wide report SHOULD add them up),
    // but utilizationPercent's denominator below is capacity, and capacity
    // scales with how many fields there are — a two-field venue fully
    // booked on both would otherwise read as 200% utilized.
    prisma.field.count({ where: { venueId, isActive: true } }),
  ]);

  const totalRevenue = bookings.reduce((sum, b) => sum + Number(b.amountPaid), 0);
  const priorTotalRevenue = priorBookings.reduce((sum, b) => sum + Number(b.amountPaid), 0);

  const buckets = new Map<string, RevenueBucket>();
  for (const b of bookings) {
    const { key, label } = bucketKey(b.date, granularity);
    const existing = buckets.get(key) ?? { key, label, revenue: 0, count: 0 };
    existing.revenue += Number(b.amountPaid);
    existing.count += 1;
    buckets.set(key, existing);
  }
  const revenueByBucket = [...buckets.values()].sort((a, b) => a.key.localeCompare(b.key));

  const heatMapMap = new Map<string, HeatMapCell>();
  for (const dayOfWeek of [0, 1, 2, 3, 4, 5, 6]) {
    for (const slotIndex of BOOKABLE_SLOT_INDEXES) {
      heatMapMap.set(`${dayOfWeek}-${slotIndex}`, { dayOfWeek, slotIndex, count: 0 });
    }
  }
  for (const b of bookings) {
    const dayOfWeek = b.date.getUTCDay();
    const cellKey = `${dayOfWeek}-${b.slotIndex}`;
    const cell = heatMapMap.get(cellKey);
    if (cell) cell.count += 1;
  }

  // At least 1 even if a venue somehow has zero active fields (shouldn't
  // happen — see lib/field.ts's doc comment — but dividing by zero here
  // would be worse than a momentarily-wrong percentage).
  const capacityFields = Math.max(1, fieldCount);
  const utilizationPercent =
    rangeLength > 0 ? (bookings.length / (rangeLength * BOOKABLE_SLOT_INDEXES.length * capacityFields)) * 100 : 0;

  return {
    from: rangeFrom,
    to: rangeTo,
    totalBookings: bookings.length,
    totalRevenue,
    totalNoShows: noShowCount,
    utilizationPercent,
    priorTotalRevenue,
    priorTotalBookings: priorBookings.length,
    revenueByBucket,
    heatMap: [...heatMapMap.values()],
    rows: bookings.map((b) => ({
      reference: b.reference,
      date: b.date,
      slotIndex: b.slotIndex,
      status: b.status,
      customerName: b.customer.fullName,
      phone: b.customer.phone,
      priceAmount: Number(b.priceAmount),
      amountPaid: Number(b.amountPaid),
    })),
  };
}
