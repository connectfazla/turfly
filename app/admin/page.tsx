import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { dateOnly } from '@/lib/availability-service';
import { sweepDueCompletions } from '@/lib/completion';
import { ALL_SLOT_INDEXES, currentSlotIndex, isMaintenanceSlot, slotLabel } from '@/lib/slots';
import { formatDateLong, formatDateParam, parseDateParam } from '@/lib/format';
import { cn } from '@/lib/utils';
import { CheckInButton } from '@/components/admin/check-in-button';
import { PaymentBadge } from '@/components/admin/payment-badge';

export const dynamic = 'force-dynamic';

interface Props {
  searchParams: Promise<{ date?: string; forbidden?: string }>;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export default async function AdminDashboardPage({ searchParams }: Props) {
  const { date: dateParam, forbidden } = await searchParams;
  const now = new Date();
  const requestedDate = dateParam ? parseDateParam(dateParam) : null;
  const day = dateOnly(requestedDate ?? now);

  await sweepDueCompletions(now);

  const bookings = await prisma.booking.findMany({
    where: { date: day, status: { in: ['HELD', 'CONFIRMED', 'COMPLETED'] } },
    include: { customer: true },
  });
  const bookingBySlot = new Map(bookings.map((b) => [b.slotIndex, b]));

  const isToday = dateOnly(now).getTime() === day.getTime();
  const highlightIndex = isToday ? currentSlotIndex(now) : null;

  return (
    <div>
      {forbidden ? (
        <div className="mb-6 rounded-(--radius-card) border border-danger/30 bg-surface-muted px-4 py-3 text-body text-danger">
          You don&apos;t have permission to view that page.
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-display text-text">Dashboard</h1>
          <p className="mt-1 text-body text-text-muted">{formatDateLong(day)}</p>
        </div>
        <div className="flex gap-2 text-caption">
          <Link
            href={`/admin?date=${formatDateParam(addDays(day, -1))}`}
            className="rounded-(--radius-input) border border-border px-3 py-1.5 text-text hover:bg-surface-muted"
          >
            ← Prev day
          </Link>
          <Link
            href="/admin"
            className="rounded-(--radius-input) border border-border px-3 py-1.5 text-text hover:bg-surface-muted"
          >
            Today
          </Link>
          <Link
            href={`/admin?date=${formatDateParam(addDays(day, 1))}`}
            className="rounded-(--radius-input) border border-border px-3 py-1.5 text-text hover:bg-surface-muted"
          >
            Next day →
          </Link>
        </div>
      </div>

      <div className="mt-6 overflow-hidden rounded-(--radius-card) border border-border">
        {ALL_SLOT_INDEXES.map((index) => {
          const booking = bookingBySlot.get(index);
          const isCurrent = index === highlightIndex;
          const maintenance = isMaintenanceSlot(index);

          return (
            <div
              key={index}
              className={cn(
                'flex flex-wrap items-center gap-3 border-b border-border px-4 py-3 last:border-b-0',
                isCurrent && 'bg-accent-soft',
              )}
            >
              <div className="w-28 shrink-0 text-body font-medium tabular-nums text-text">{slotLabel(index)}</div>

              {maintenance ? (
                <div className="flex-1 text-body text-warning">Maintenance</div>
              ) : booking ? (
                <>
                  <div className="min-w-0 flex-1">
                    <Link href={`/admin/bookings/${booking.id}`} className="text-body text-text hover:underline">
                      {booking.customer.fullName}
                    </Link>
                    <div className="text-caption tabular-nums text-text-muted">
                      {booking.customer.phone} · {booking.reference}
                    </div>
                  </div>
                  <div className="shrink-0">
                    <PaymentBadge status={booking.paymentStatus} />
                  </div>
                  <div className="w-28 shrink-0 text-right">
                    {booking.status === 'CONFIRMED' && !booking.checkedInAt ? (
                      <CheckInButton bookingId={booking.id} />
                    ) : booking.checkedInAt ? (
                      <span className="text-caption text-accent">Checked in</span>
                    ) : null}
                  </div>
                </>
              ) : (
                <div className="flex-1 text-body text-text-muted">Free</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

