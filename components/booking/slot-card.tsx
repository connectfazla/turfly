import { cn } from '@/lib/utils';
import { formatBDT } from '@/lib/format';
import type { PublicSlotView } from './types';

const STATE_LABEL: Record<PublicSlotView['state'], string> = {
  AVAILABLE: 'Available',
  BOOKED: 'Booked',
  BLOCKED: 'Blocked',
  MAINTENANCE: 'Maintenance',
  PAST: 'Past',
};

/** "19:30 – 21:00" -> "19:30 to 21:00", for a speakable accessible name. */
function speakableRange(label: string): string {
  return label.replace(' – ', ' to ');
}

export function slotAccessibleName(slot: PublicSlotView): string {
  const range = speakableRange(slot.label);
  if (slot.state === 'AVAILABLE' && slot.price !== null) {
    return `Book ${range}, ${slot.price} taka, available`;
  }
  return `${range}, ${STATE_LABEL[slot.state].toLowerCase()}`;
}

export interface SlotCardProps {
  slot: PublicSlotView;
  selected?: boolean;
  onSelect?: (slot: PublicSlotView) => void;
}

/**
 * Four visual treatments for five states — MAINTENANCE and BLOCKED share
 * the warning styling (CLAUDE.md §6: warning is used for "maintenance,
 * blackouts"), differing only in their text label, never colour alone.
 */
export function SlotCard({ slot, selected, onSelect }: SlotCardProps) {
  const isAvailable = slot.state === 'AVAILABLE';
  const isWarned = slot.state === 'MAINTENANCE' || slot.state === 'BLOCKED';

  return (
    <button
      type="button"
      disabled={!isAvailable}
      aria-pressed={isAvailable ? selected : undefined}
      aria-label={slotAccessibleName(slot)}
      onClick={isAvailable ? () => onSelect?.(slot) : undefined}
      className={cn(
        'flex min-h-[72px] w-full flex-col justify-between rounded-(--radius-card) border p-3 text-left transition-colors',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
        isAvailable &&
          !selected &&
          'border-accent/40 bg-accent-soft text-text hover:border-accent hover:bg-accent-soft',
        isAvailable && selected && 'border-accent bg-accent text-white',
        !isAvailable && isWarned && 'border-warning/30 bg-surface-muted text-warning',
        !isAvailable &&
          !isWarned &&
          'border-border bg-surface-muted text-text-muted',
      )}
    >
      <span className="text-body font-medium tabular-nums">{slot.label}</span>
      <span className="flex items-center justify-between text-caption">
        <span>{STATE_LABEL[slot.state]}</span>
        {isAvailable && slot.price !== null ? (
          <span className={cn('font-medium tabular-nums', selected ? 'text-white' : 'text-text')}>
            {formatBDT(slot.price)}
          </span>
        ) : null}
      </span>
    </button>
  );
}
