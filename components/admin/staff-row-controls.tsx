'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { changeStaffRoleAction, setStaffActiveAction } from '@/app/actions/venue-staff';

export function StaffRowControls({
  userId,
  role,
  isActive,
}: {
  userId: string;
  role: 'MANAGER' | 'BOOKIE';
  isActive: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setPending(true);
    setError(null);
    const result = await fn();
    setPending(false);
    if (!result.ok) {
      setError(result.error ?? 'Something went wrong.');
      return;
    }
    router.refresh();
  }

  if (error) return <span className="text-caption text-danger">{error}</span>;

  return (
    <span className="flex items-center justify-end gap-3 text-caption">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          run(() => changeStaffRoleAction({ userId, role: role === 'MANAGER' ? 'BOOKIE' : 'MANAGER' }))
        }
        className="text-text-muted hover:text-text hover:underline"
      >
        Make {role === 'MANAGER' ? 'Bookie' : 'Manager'}
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => run(() => setStaffActiveAction({ userId, isActive: !isActive }))}
        className={isActive ? 'text-danger hover:underline' : 'text-accent hover:underline'}
      >
        {isActive ? 'Deactivate' : 'Reactivate'}
      </button>
    </span>
  );
}
