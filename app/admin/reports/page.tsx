/**
 * ROUTE: /admin/reports — ADMIN-only.
 *
 * Date-range summary (bookings, revenue, no-shows, utilisation) with a
 * prior-period comparison, a revenue-by-day/week/month chart, and a slot
 * x day-of-week utilisation heat map. All the numbers come from
 * lib/reports.ts's buildReport(), the same function the CSV export route
 * uses, so this page and the download always agree.
 */
import { buildReport, type Granularity } from '@/lib/reports';
import { formatBDT, formatDateParam, parseDateParam } from '@/lib/format';
import { ReportsFilterForm } from '@/components/admin/reports-filter-form';
import { StatCard } from '@/components/admin/stat-card';
import { RevenueChart } from '@/components/admin/revenue-chart';
import { UtilizationHeatmap } from '@/components/admin/utilization-heatmap';
import { requireRole } from '@/lib/auth/require-role';

export const dynamic = 'force-dynamic';

interface Props {
  searchParams: Promise<{ from?: string; to?: string; granularity?: string }>;
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function percentDelta(current: number, prior: number): { text: string; positive: boolean } | undefined {
  if (prior === 0) {
    if (current === 0) return undefined;
    return { text: 'new vs prior period', positive: true };
  }
  const pct = ((current - prior) / prior) * 100;
  return { text: `${pct >= 0 ? '+' : ''}${pct.toFixed(0)}% vs prior period`, positive: pct >= 0 };
}

export default async function AdminReportsPage({ searchParams }: Props) {
  // OWNER-only route. This is the real gate: middleware only proves
  // somebody is signed in, and the sidebar hiding the link is cosmetic.
  await requireRole('OWNER');
  const params = await searchParams;
  const now = new Date();
  const from = (params.from ? parseDateParam(params.from) : null) ?? startOfMonth(now);
  const to = (params.to ? parseDateParam(params.to) : null) ?? now;
  const granularity: Granularity = (params.granularity as Granularity) ?? 'day';

  const report = await buildReport(from, to, granularity);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-display text-text">Reports</h1>
        <p className="mt-1 text-body text-text-muted">
          Revenue = amount actually collected (confirmed, completed and no-show bookings).
        </p>
      </div>

      <ReportsFilterForm from={formatDateParam(from)} to={formatDateParam(to)} granularity={granularity} />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Bookings" value={String(report.totalBookings)} delta={percentDelta(report.totalBookings, report.priorTotalBookings)} />
        <StatCard label="Revenue" value={formatBDT(report.totalRevenue)} delta={percentDelta(report.totalRevenue, report.priorTotalRevenue)} />
        <StatCard label="No-shows" value={String(report.totalNoShows)} />
        <StatCard label="Utilisation" value={`${report.utilizationPercent.toFixed(0)}%`} />
      </div>

      <div className="rounded-(--radius-card) border border-border bg-surface p-4">
        <h2 className="text-subheading text-text">Revenue by {granularity}</h2>
        <div className="mt-3">
          <RevenueChart buckets={report.revenueByBucket} />
        </div>
      </div>

      <div className="rounded-(--radius-card) border border-border bg-surface p-4">
        <h2 className="text-subheading text-text">Utilisation: slot by day of week</h2>
        <p className="mt-1 text-caption text-text-muted">Bookings per slot across the selected range.</p>
        <div className="mt-3">
          <UtilizationHeatmap cells={report.heatMap} />
        </div>
      </div>
    </div>
  );
}
