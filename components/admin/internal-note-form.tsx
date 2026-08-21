'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { updateBookingNoteAction } from '@/app/actions/admin-bookings';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';

export function InternalNoteForm({ bookingId, initialNote }: { bookingId: string; initialNote: string }) {
  const router = useRouter();
  const [value, setValue] = useState(initialNote);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function handleSave() {
    setPending(true);
    setError(null);
    setSaved(false);
    const result = await updateBookingNoteAction({ bookingId, internalNote: value });
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSaved(true);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2">
      <Textarea
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setSaved(false);
        }}
        rows={3}
        placeholder="Internal note, not visible to the customer"
        className="rounded-(--radius-input)"
      />
      <div className="flex items-center gap-3">
        <Button type="button" size="sm" variant="outline" disabled={pending} onClick={handleSave}>
          {pending ? 'Saving…' : 'Save note'}
        </Button>
        {saved ? <span className="text-caption text-accent">Saved</span> : null}
        {error ? <span className="text-caption text-danger">{error}</span> : null}
      </div>
    </div>
  );
}
