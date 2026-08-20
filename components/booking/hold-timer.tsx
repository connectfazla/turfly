'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

export interface HoldTimerProps {
  /** ISO timestamp. */
  expiresAt: string;
  onExpire?: () => void;
}

const WARNING_THRESHOLD_SECONDS = 120;

/** Visible countdown from HOLD_MINUTES (CLAUDE.md §8) — the DB is the real
 * authority on expiry (booking-engine sweeps it), this is purely a UI cue. */
export function HoldTimer({ expiresAt, onExpire }: HoldTimerProps) {
  const target = new Date(expiresAt).getTime();
  const [remainingMs, setRemainingMs] = useState(() => target - Date.now());

  useEffect(() => {
    const id = setInterval(() => {
      const ms = target - Date.now();
      setRemainingMs(ms);
      if (ms <= 0) {
        clearInterval(id);
        onExpire?.();
      }
    }, 1000);
    return () => clearInterval(id);
  }, [target, onExpire]);

  const totalSeconds = Math.max(0, Math.floor(remainingMs / 1000));
  const mm = Math.floor(totalSeconds / 60);
  const ss = totalSeconds % 60;
  const isWarning = totalSeconds <= WARNING_THRESHOLD_SECONDS;

  return (
    <div
      role="timer"
      aria-live="polite"
      aria-label={`Hold expires in ${mm} minutes ${ss} seconds`}
      className={cn(
        'inline-flex items-center gap-2 rounded-(--radius-card) border px-3 py-1.5 text-body font-medium tabular-nums',
        isWarning ? 'border-warning/40 bg-surface-muted text-warning' : 'border-border bg-surface-muted text-text',
      )}
    >
      <span className="text-caption font-normal text-text-muted">Hold expires in</span>
      <span>
        {String(mm).padStart(2, '0')}:{String(ss).padStart(2, '0')}
      </span>
    </div>
  );
}
