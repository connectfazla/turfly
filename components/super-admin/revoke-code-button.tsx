'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { revokeRegistrationCodeAction } from '@/app/actions/super-admin';

/** Two-step, no dialog: revoking is reversible only by issuing a new code, so
 * it deserves a confirmation, but a modal for a one-line action in a table row
 * is heavier than the decision warrants. */
export function RevokeCodeButton({ code }: { code: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function revoke() {
    setPending(true);
    setError(null);
    const result = await revokeRegistrationCodeAction({ code });
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      setConfirming(false);
      return;
    }
    router.refresh();
  }

  if (error) {
    return <span className="text-caption text-danger">{error}</span>;
  }

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="text-caption text-danger hover:underline"
      >
        Revoke
      </button>
    );
  }

  return (
    <span className="flex items-center gap-2 text-caption">
      <button type="button" onClick={revoke} disabled={pending} className="font-medium text-danger hover:underline">
        {pending ? 'Revoking…' : 'Confirm'}
      </button>
      <button type="button" onClick={() => setConfirming(false)} className="text-text-muted hover:underline">
        Cancel
      </button>
    </span>
  );
}
