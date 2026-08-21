'use client';

import { useRouter } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useState } from 'react';

export function ReportsFilterForm({
  from,
  to,
  granularity,
}: {
  from: string;
  to: string;
  granularity: string;
}) {
  const router = useRouter();
  const [g, setG] = useState(granularity);

  return (
    <form
      action={(formData) => {
        const params = new URLSearchParams({
          from: String(formData.get('from') ?? from),
          to: String(formData.get('to') ?? to),
          granularity: g,
        });
        router.push(`/admin/reports?${params.toString()}`);
      }}
      className="flex flex-wrap items-end gap-3"
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="repFrom">From</Label>
        <Input id="repFrom" name="from" type="date" defaultValue={from} className="rounded-(--radius-input)" />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="repTo">To</Label>
        <Input id="repTo" name="to" type="date" defaultValue={to} className="rounded-(--radius-input)" />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="repGranularity">Group by</Label>
        <Select value={g} onValueChange={setG}>
          <SelectTrigger id="repGranularity" className="w-32 rounded-(--radius-input)">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="day">Day</SelectItem>
            <SelectItem value="week">Week</SelectItem>
            <SelectItem value="month">Month</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Button type="submit">Apply</Button>
      <Button asChild variant="outline">
        <a href={`/admin/reports/export?from=${from}&to=${to}`}>Export CSV</a>
      </Button>
    </form>
  );
}
