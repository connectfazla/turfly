'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createBlackoutAction, previewBlackoutImpactAction, type AffectedBooking } from '@/app/actions/blackouts';
import { ALL_SLOT_INDEXES, slotLabel } from '@/lib/slots';
import { formatDateParam } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const WHOLE_DAY = 'WHOLE_DAY';

export function CreateBlackoutForm() {
  const router = useRouter();
  const [date, setDate] = useState(formatDateParam(new Date()));
  const [slotChoice, setSlotChoice] = useState(WHOLE_DAY);
  const [reason, setReason] = useState('');
  const [affected, setAffected] = useState<AffectedBooking[] | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const slotIndex = slotChoice === WHOLE_DAY ? ('' as const) : Number(slotChoice);

  async function handleCheck(e: React.FormEvent) {
    e.preventDefault();
    if (reason.trim().length < 3) {
      setError('Enter a reason (at least 3 characters).');
      return;
    }
    setPending(true);
    setError(null);
    const result = await previewBlackoutImpactAction({ date, slotIndex });
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    if (result.data.affected.length > 0) {
      setAffected(result.data.affected);
      return;
    }
    await doCreate();
  }

  async function doCreate() {
    setPending(true);
    setError(null);
    const result = await createBlackoutAction({ date, slotIndex, reason });
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setAffected(null);
    setReason('');
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={handleCheck} className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="blackoutDate">Date</Label>
          <Input
            id="blackoutDate"
            type="date"
            min={formatDateParam(new Date())}
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              setAffected(null);
            }}
            className="rounded-(--radius-input)"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="blackoutSlot">Scope</Label>
          <Select
            value={slotChoice}
            onValueChange={(v) => {
              setSlotChoice(v);
              setAffected(null);
            }}
          >
            <SelectTrigger id="blackoutSlot" className="w-44 rounded-(--radius-input)">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={WHOLE_DAY}>Whole day</SelectItem>
              {ALL_SLOT_INDEXES.map((i) => (
                <SelectItem key={i} value={String(i)}>
                  {slotLabel(i)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="blackoutReason">Reason</Label>
          <Input
            id="blackoutReason"
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
              setAffected(null);
            }}
            className="w-56 rounded-(--radius-input)"
          />
        </div>
        <Button type="submit" disabled={pending}>
          {pending ? 'Checking…' : 'Create blackout'}
        </Button>
      </form>

      {error ? (
        <p role="alert" className="text-caption text-danger">
          {error}
        </p>
      ) : null}

      {affected ? (
        <div className="rounded-(--radius-card) border border-warning/30 bg-surface-muted p-4">
          <p className="text-body font-medium text-warning">
            This will affect {affected.length} existing booking{affected.length === 1 ? '' : 's'}:
          </p>
          <ul className="mt-2 flex flex-col gap-1 text-caption text-text-muted">
            {affected.map((b) => (
              <li key={b.reference}>
                {b.reference} · {b.customerName} · {b.slotLabel}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-caption text-text-muted">
            The blackout does not cancel these automatically. Cancel or reschedule them from the
            Bookings page.
          </p>
          <div className="mt-3 flex gap-2">
            <Button type="button" variant="destructive" size="sm" disabled={pending} onClick={doCreate}>
              {pending ? 'Creating…' : 'Create anyway'}
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => setAffected(null)}>
              Back
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
