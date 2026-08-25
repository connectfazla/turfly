'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { setVenueActiveAction } from '@/app/actions/super-admin';

/** Deactivating hides the venue from its own staff (accessibleVenueIds only
 * returns active venues) and from the public booking page. That is a big
 * enough consequence to confirm, and a small enough one not to need a modal. */
export function VenueActiveToggle({ venueId, isActive }: { venueId: string; isActive: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function apply(next: boolean) {
    setPending(true);
    setError(null);
    const result = await setVenueActiveAction({ venueId, isActive: next });
    setPending(false);
    setConfirming(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  if (error) return <span className="text-caption text-danger">{error}</span>;

  if (!isActive) {
    return (
      <button
        type="button"
        onClick={() => apply(true)}
        disabled={pending}
        className="rounded-(--radius-input) border border-border px-3 py-1.5 text-caption text-text transition-colors hover:bg-surface-muted"
      >
        {pending ? 'Reactivating…' : 'Reactivate'}
      </button>
    );
  }

  if (confirming) {
    return (
      <span className="flex items-center gap-2 text-caption">
        <span className="text-text-muted">Hide from staff and customers?</span>
        <button type="button" onClick={() => apply(false)} disabled={pending} className="font-medium text-danger hover:underline">
          {pending ? 'Deactivating…' : 'Confirm'}
        </button>
        <button type="button" onClick={() => setConfirming(false)} className="text-text-muted hover:underline">
          Cancel
        </button>
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setConfirming(true)}
      className="text-caption text-text-muted transition-colors hover:text-danger"
    >
      Deactivate
    </button>
  );
}
