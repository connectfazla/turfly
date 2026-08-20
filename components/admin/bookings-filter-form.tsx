'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const STATUS_OPTIONS = [
  { value: 'ALL', label: 'Any status' },
  { value: 'HELD', label: 'Held' },
  { value: 'CONFIRMED', label: 'Confirmed' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'CANCELLED', label: 'Cancelled' },
  { value: 'EXPIRED', label: 'Expired' },
  { value: 'NO_SHOW', label: 'No-show' },
];

export interface BookingsFilterFormProps {
  defaultValues: {
    q: string;
    phone: string;
    status: string;
    from: string;
    to: string;
  };
}

/** A plain URL-driven filter (no client fetch waterfall — submitting just
 * navigates to /admin/bookings?... and the list page re-queries server-side). */
export function BookingsFilterForm({ defaultValues }: BookingsFilterFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState(defaultValues.status || 'ALL');

  function onSubmit(formData: FormData) {
    const params = new URLSearchParams(searchParams.toString());
    for (const key of ['q', 'phone', 'from', 'to']) {
      const value = String(formData.get(key) ?? '').trim();
      if (value) params.set(key, value);
      else params.delete(key);
    }
    if (status && status !== 'ALL') params.set('status', status);
    else params.delete('status');
    router.push(`/admin/bookings?${params.toString()}`);
  }

  return (
    <form action={onSubmit} className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="q">Reference or name</Label>
        <Input id="q" name="q" defaultValue={defaultValues.q} className="w-48 rounded-(--radius-input)" />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="phone">Phone</Label>
        <Input id="phone" name="phone" defaultValue={defaultValues.phone} className="w-40 rounded-(--radius-input)" />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="from">From</Label>
        <Input id="from" name="from" type="date" defaultValue={defaultValues.from} className="rounded-(--radius-input)" />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="to">To</Label>
        <Input id="to" name="to" type="date" defaultValue={defaultValues.to} className="rounded-(--radius-input)" />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="status">Status</Label>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger id="status" className="w-40 rounded-(--radius-input)">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Button type="submit">Filter</Button>
    </form>
  );
}
