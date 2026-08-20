'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { checkInBookingAction } from '@/app/actions/admin-bookings';

export function CheckInButton({ bookingId }: { bookingId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setPending(true);
    setError(null);
    const result = await checkInBookingAction({ bookingId });
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button size="sm" variant="outline" disabled={pending} onClick={handleClick}>
        {pending ? 'Checking in…' : 'Check in'}
      </Button>
      {error ? <span className="text-caption text-danger">{error}</span> : null}
    </div>
  );
}
