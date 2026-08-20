import Link from 'next/link';
import { fetchDayAvailability } from '@/lib/availability-service';
import { prisma } from '@/lib/prisma';
import { formatDateParam } from '@/lib/format';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

interface Props {
  searchParams: Promise<{ month?: string }>; // yyyy-MM
}

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function monthBounds(monthParam?: string): { year: number; month: number } {
  if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
    const [y, m] = monthParam.split('-').map(Number);
    return { year: y!, month: m! - 1 };
  }
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() };
}

export default async function AdminCalendarPage({ searchParams }: Props) {
  const { month: monthParam } = await searchParams;
  const { year, month } = monthBounds(monthParam);

  const firstOfMonth = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const leadingBlanks = firstOfMonth.getDay();
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const days = await Promise.all(
    Array.from({ length: daysInMonth }, (_, i) => new Date(year, month, i + 1)).map(async (date) => {
      const { slots } = await fetchDayAvailability(prisma, date, now);
      return {
        date,
        freeCount: slots.filter((s) => s.state === 'AVAILABLE').length,
        isPast: date.getTime() < today.getTime(),
        isToday: date.getTime() === today.getTime(),
      };
    }),
  );

  const prevMonth = new Date(year, month - 1, 1);
  const nextMonth = new Date(year, month + 1, 1);
  const monthLabel = firstOfMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-display text-text">Calendar</h1>
        <div className="flex items-center gap-3 text-caption">
          <Link
            href={`/admin/calendar?month=${prevMonth.getFullYear()}-${String(prevMonth.getMonth() + 1).padStart(2, '0')}`}
            className="rounded-(--radius-input) border border-border px-3 py-1.5 text-text hover:bg-surface-muted"
          >
            ← Prev
          </Link>
          <span className="text-body text-text">{monthLabel}</span>
          <Link
            href={`/admin/calendar?month=${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, '0')}`}
            className="rounded-(--radius-input) border border-border px-3 py-1.5 text-text hover:bg-surface-muted"
          >
            Next →
          </Link>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-7 gap-2 text-center text-caption text-text-muted">
        {WEEKDAY_LABELS.map((d) => (
          <div key={d}>{d}</div>
        ))}
        {Array.from({ length: leadingBlanks }).map((_, i) => (
          <div key={`blank-${i}`} />
        ))}
        {days.map(({ date, freeCount, isPast, isToday }) => (
          <Link
            key={date.getDate()}
            href={`/admin?date=${formatDateParam(date)}`}
            className={cn(
              'flex flex-col items-center gap-1 rounded-(--radius-card) border p-3',
              isToday ? 'border-accent bg-accent-soft' : 'border-border bg-surface',
              isPast && 'opacity-50',
            )}
          >
            <span className="text-body font-medium text-text tabular-nums">{date.getDate()}</span>
            <span className="text-caption text-text-muted">{freeCount} free</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
