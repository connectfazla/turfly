import Link from 'next/link';
import { cn } from '@/lib/utils';
import { fetchDayAvailability } from '@/lib/availability-service';
import { prisma } from '@/lib/prisma';
import { bookingWindowDates } from '@/lib/booking-window';
import { formatDateParam, formatDateShort } from '@/lib/format';

export interface DateStripProps {
  selected: string; // yyyy-MM-dd
}

/** 14 days, free-slot counts (BUILD_PLAN.md step 4) — reuses the same
 * fetchDayAvailability() as the slot grid and the JSON API. */
export async function DateStrip({ selected }: DateStripProps) {
  const now = new Date();
  const days = await Promise.all(
    bookingWindowDates(now).map(async (date) => {
      const { slots } = await fetchDayAvailability(prisma, date, now);
      return {
        param: formatDateParam(date),
        label: formatDateShort(date),
        freeCount: slots.filter((s) => s.state === 'AVAILABLE').length,
      };
    }),
  );

  return (
    <nav aria-label="Choose a date" className="flex gap-2 overflow-x-auto pb-2">
      {days.map((day) => {
        const isSelected = day.param === selected;
        return (
          <Link
            key={day.param}
            href={`/book/${day.param}`}
            aria-current={isSelected ? 'date' : undefined}
            className={cn(
              'flex min-w-[92px] shrink-0 flex-col items-center gap-0.5 rounded-(--radius-card) border px-3 py-2 text-center transition-colors',
              isSelected
                ? 'border-accent bg-accent text-white'
                : 'border-border bg-surface text-text hover:border-accent/50',
            )}
          >
            <span className="text-caption font-medium">{day.label}</span>
            <span className={cn('text-caption', isSelected ? 'text-white/80' : 'text-text-muted')}>
              {day.freeCount} free
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
