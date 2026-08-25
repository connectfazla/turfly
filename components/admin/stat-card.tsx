import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export function StatCard({
  label,
  value,
  delta,
  icon: Icon,
}: {
  label: string;
  value: string;
  /** e.g. "+12% vs prior period" — signed text, colour is not the only cue. */
  delta?: { text: string; positive: boolean };
  icon?: LucideIcon;
}) {
  return (
    <div className="group rounded-(--radius-card) border border-border bg-surface p-4 shadow-(--shadow-elevated) transition-[transform,box-shadow] hover:-translate-y-0.5 hover:shadow-[0_1px_2px_rgba(24,24,27,0.04),0_12px_32px_rgba(24,24,27,0.09)]">
      <div className="flex items-start justify-between gap-2">
        <div className="text-caption font-medium text-text-muted">{label}</div>
        {Icon ? (
          <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-surface-muted text-text-muted transition-colors group-hover:bg-accent-soft/60 group-hover:text-accent">
            <Icon className="size-[15px]" strokeWidth={2} aria-hidden="true" />
          </div>
        ) : null}
      </div>
      <div className="mt-2 text-heading tabular-nums text-text">{value}</div>
      {delta ? (
        <div className={cn('mt-1 text-caption tabular-nums', delta.positive ? 'text-accent' : 'text-danger')}>
          {delta.text}
        </div>
      ) : null}
    </div>
  );
}
