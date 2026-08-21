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
      <BarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
        <CartesianGrid stroke="#E5E7EB" vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#6B7280' }} axisLine={{ stroke: '#E5E7EB' }} tickLine={false} />
        <YAxis
          tick={{ fontSize: 12, fill: '#6B7280' }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v: number) => formatBDT(v)}
          width={80}
        />
        <Tooltip
          formatter={(value) => [formatBDT(Number(value ?? 0)), 'Revenue']}
          contentStyle={{ borderRadius: 8, borderColor: '#E5E7EB', fontSize: 12 }}
        />
        <Legend wrapperStyle={{ fontSize: 12, color: '#6B7280' }} />
        <Bar dataKey="revenue" name="Revenue" fill="#15803D" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
