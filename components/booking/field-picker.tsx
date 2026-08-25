import Link from 'next/link';
import { cn } from '@/lib/utils';
import { getActiveFields, type FieldOption } from '@/lib/field';

export type { FieldOption };
export { getActiveFields };

/**
 * The "which field" landing shown on /book when a venue has more than one
 * active field — app/book/page.tsx skips straight past this (redirects to
 * today's date) when there's exactly one, so a single-field venue (still
 * nearly every venue) sees no extra step at all.
 */
export function FieldPicker({ fields, dateParam }: { fields: FieldOption[]; dateParam: string }) {
  return (
    <div role="list" aria-label="Choose a field" className="grid gap-3 sm:grid-cols-2">
      {fields.map((field) => (
        <Link
          key={field.id}
          href={`/book/${dateParam}?field=${field.id}`}
          role="listitem"
          className="flex flex-col gap-1 rounded-(--radius-card) border border-border bg-surface p-4 transition-colors hover:border-accent/50 hover:bg-accent-soft/20"
        >
          <span className="text-subheading text-text">{field.name}</span>
          <span className="text-caption text-text-muted">{field.sportName}</span>
        </Link>
      ))}
    </div>
  );
}

/** Compact inline switcher for /book/[date] — same field list, a small row
 * of pills instead of a full-page picker, so a visitor already looking at
 * a day's schedule can switch fields without leaving the page. */
export function FieldSwitcher({
  fields,
  selectedFieldId,
  dateParam,
}: {
  fields: FieldOption[];
  selectedFieldId: string;
  dateParam: string;
}) {
  if (fields.length <= 1) return null;
  return (
    <nav aria-label="Choose a field" className="flex flex-wrap gap-2">
      {fields.map((field) => {
        const isSelected = field.id === selectedFieldId;
        return (
          <Link
            key={field.id}
            href={`/book/${dateParam}?field=${field.id}`}
            aria-current={isSelected ? 'true' : undefined}
            className={cn(
              'rounded-full border px-3 py-1.5 text-caption font-medium transition-colors',
              isSelected
                ? 'border-accent bg-accent text-white'
                : 'border-border bg-surface text-text hover:border-accent/50',
            )}
          >
            {field.name}
          </Link>
        );
      })}
    </nav>
  );
}
