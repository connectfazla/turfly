'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { rescheduleBookingStaffAction } from '@/app/actions/admin-bookings';
import { ALL_SLOT_INDEXES, slotLabel } from '@/lib/slots';
import { formatDateParam } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export function RescheduleForm({ bookingId, currentDate, currentSlotIndex }: { bookingId: string; currentDate: string; currentSlotIndex: number }) {
  const router = useRouter();
  const [date, setDate] = useState(currentDate);
  const [slotIndex, setSlotIndex] = useState(String(currentSlotIndex));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const result = await rescheduleBookingStaffAction({
      bookingId,
      newDate: date,
      newSlotIndex: Number(slotIndex),
    });
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="newDate">New date</Label>
        <Input
          id="newDate"
          type="date"
          value={date}
          min={formatDateParam(new Date())}
          onChange={(e) => setDate(e.target.value)}
          className="rounded-(--radius-input)"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="newSlot">New slot</Label>
        <Select value={slotIndex} onValueChange={setSlotIndex}>
          <SelectTrigger id="newSlot" className="w-44 rounded-(--radius-input)">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ALL_SLOT_INDEXES.map((i) => (
              <SelectItem key={i} value={String(i)}>
                {slotLabel(i)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Button type="submit" variant="outline" disabled={pending}>
        {pending ? 'Rescheduling…' : 'Reschedule'}
      </Button>
      {error ? (
        <p role="alert" className="w-full text-caption text-danger">
          {error}
        </p>
      ) : null}
    </form>
  );
}
