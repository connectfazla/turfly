'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Wallet, ClipboardList, UserCog } from 'lucide-react';
import { startDemoSessionAction } from '@/app/actions/demo';
import type { DemoRole } from '@/lib/demo';

const ROLES: { role: DemoRole; label: string; blurb: string; icon: typeof UserCog }[] = [
  {
    role: 'OWNER',
    label: 'Owner',
    blurb: 'Everything — pricing, staff, reports, and the full audit trail.',
    icon: UserCog,
  },
  {
    role: 'MANAGER',
    label: 'Manager',
    blurb: 'Takes bookings, verifies payments, sees the reports. No pricing or staff.',
    icon: Wallet,
  },
  {
    role: 'BOOKIE',
    label: 'Bookie',
    blurb: 'Bookings and check-in only. Try opening Reports — it will refuse.',
    icon: ClipboardList,
  },
];

export function DemoRolePicker() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [loadingRole, setLoadingRole] = useState<DemoRole | null>(null);
  const [error, setError] = useState<string | null>(null);

  function enter(role: DemoRole) {
    setError(null);
    setLoadingRole(role);
    startTransition(async () => {
      const result = await startDemoSessionAction(role);
      if (!result.ok) {
        setLoadingRole(null);
        setError(result.error);
        return;
      }
      router.push('/admin');
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-caption font-medium text-text-muted">Enter as</p>
      {ROLES.map(({ role, label, blurb, icon: Icon }) => (
        <button
          key={role}
          type="button"
          disabled={pending}
          onClick={() => enter(role)}
          className="flex items-center gap-3 rounded-(--radius-input) border border-border p-3 text-left transition-colors hover:border-accent hover:bg-accent-soft/40 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-surface-muted text-accent">
            <Icon className="size-[18px]" aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-body font-medium text-text">
              {loadingRole === role ? 'Entering…' : label}
            </span>
            <span className="block text-caption text-text-muted">{blurb}</span>
          </span>
        </button>
      ))}

      {error ? (
        <p role="alert" className="text-caption text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
