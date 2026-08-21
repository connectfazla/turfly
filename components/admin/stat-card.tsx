import { cn } from '@/lib/utils';

export function StatCard({
  label,
  value,
  delta,
}: {
  label: string;
  value: string;
  /** e.g. "+12% vs prior period" — signed text, colour is not the only cue. */
  delta?: { text: string; positive: boolean };
}) {
  return (
    <div className="rounded-(--radius-card) border border-border bg-surface p-4">
      <div className="text-caption text-text-muted">{label}</div>
      <div className="mt-1 text-heading tabular-nums text-text">{value}</div>
      {delta ? (
        <div className={cn('mt-1 text-caption tabular-nums', delta.positive ? 'text-accent' : 'text-danger')}>
          {delta.text}
        </div>
      ) : null}
    </div>
  );
}
