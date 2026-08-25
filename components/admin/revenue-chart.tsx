'use client';

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatBDT } from '@/lib/format';
import type { RevenueBucket } from '@/lib/reports';

export function RevenueChart({ buckets }: { buckets: RevenueBucket[] }) {
  const data = buckets.map((b) => ({ label: b.label, revenue: b.revenue, bookings: b.count }));

  if (data.length === 0) {
    return <p className="py-10 text-center text-body text-text-muted">No revenue in this range.</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={280}>
      {/* CSS custom properties, not hardcoded hex — SVG presentation
        * attributes accept var() in every browser this app targets, so
        * this chart now follows [data-dashboard-theme]'s neutrals/accent
        * instead of a copy that happened to match them once and would
        * silently drift the next time the theme's palette moves. */}
      <BarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
        <CartesianGrid stroke="var(--color-border)" vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 12, fill: 'var(--color-text-muted)' }}
          axisLine={{ stroke: 'var(--color-border)' }}
          tickLine={false}
        />
        <YAxis
          tick={{ fontSize: 12, fill: 'var(--color-text-muted)' }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v: number) => formatBDT(v)}
          width={80}
        />
        <Tooltip
          formatter={(value) => [formatBDT(Number(value ?? 0)), 'Revenue']}
          contentStyle={{ borderRadius: 8, borderColor: 'var(--color-border)', fontSize: 12 }}
        />
        <Legend wrapperStyle={{ fontSize: 12, color: 'var(--color-text-muted)' }} />
        <Bar dataKey="revenue" name="Revenue" fill="var(--color-accent)" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
