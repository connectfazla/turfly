'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { X } from 'lucide-react';
import { startDemoSessionAction } from '@/app/actions/demo';
import { signOutAction } from '@/app/actions/auth';
import type { DemoRole } from '@/lib/demo';

const OTHER_ROLES: Record<DemoRole, { role: DemoRole; label: string }[]> = {
  OWNER: [
    { role: 'MANAGER', label: 'Manager' },
    { role: 'BOOKIE', label: 'Bookie' },
  ],
  MANAGER: [
    { role: 'OWNER', label: 'Owner' },
    { role: 'BOOKIE', label: 'Bookie' },
  ],
  BOOKIE: [
    { role: 'OWNER', label: 'Owner' },
    { role: 'MANAGER', label: 'Manager' },
  ],
};

/**
 * Persistent, impossible-to-miss strip across the top of every /admin page
 * while signed in as a demo account. Two jobs: nobody mistakes sample data
 * for a real business, and switching role is one click instead of a sign
 * out + re-navigate to /demo round trip.
 */
export function DemoBanner({ role }: { role: DemoRole }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function switchTo(next: DemoRole) {
    startTransition(async () => {
      const result = await startDemoSessionAction(next);
      if (result.ok) {
        router.push('/admin');
        router.refresh();
      }
    });
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-warning/30 bg-warning/10 px-4 py-2 text-caption text-warning sm:px-8">
      <span className="font-medium">Demo mode — sample data, not a real business.</span>
      <div className="flex items-center gap-3">
        <span className="text-text-muted">Switch to:</span>
        {OTHER_ROLES[role].map((r) => (
          <button
            key={r.role}
            type="button"
            disabled={pending}
            onClick={() => switchTo(r.role)}
            className="font-medium text-warning underline underline-offset-2 hover:no-underline disabled:opacity-60"
          >
            {r.label}
          </button>
        ))}
        <form action={signOutAction}>
          <button
            type="submit"
            className="flex items-center gap-1 text-text-muted hover:text-text"
            aria-label="Exit demo"
          >
            <X className="size-3.5" aria-hidden="true" />
            Exit
          </button>
        </form>
      </div>
    </div>
  );
}
