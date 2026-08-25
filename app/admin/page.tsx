/**
 * ROUTE: /admin (dashboard) — staff (ADMIN or MODERATOR).
 *
 * Two parts: a stat-cards row (today's bookings/revenue, this month,
 * anything awaiting payment verification — the "business at a glance"
 * read staff want before diving into a specific day) built on top of the
 * same buildReport() the /admin/reports page uses, so the numbers never
 * disagree with each other; and the "DayTimeline" below it — all 16
 * slots for one day (default today, ?date= to browse others), the
 * current slot highlighted, each occupied row showing the customer,
 * phone, payment status, and a one-tap check-in. Runs an opportunistic
 * CONFIRMED -> COMPLETED sweep (lib/completion.ts) before reading, since
 * there's no cron in a project this size.
 */
import Link from 'next/link';
import { CalendarCheck, Wallet, TrendingUp, Clock3, Users2, ChevronLeft, ChevronRight } from 'lucide-react';
import { prisma } from '@/lib/prisma';
import { requireRole } from '@/lib/auth/require-role';
import { dateOnly } from '@/lib/availability-service';
import { sweepDueCompletions } from '@/lib/completion';
import { buildReport } from '@/lib/reports';
import { ALL_SLOT_INDEXES, currentSlotIndex, isMaintenanceSlot, slotLabel } from '@/lib/slots';
import { formatBDT, formatDateLong, formatDateParam, parseDateParam } from '@/lib/format';
import { cn } from '@/lib/utils';
import { CheckInButton } from '@/components/admin/check-in-button';
import { PaymentBadge } from '@/components/admin/payment-badge';
import { StatCard } from '@/components/admin/stat-card';

export const dynamic = 'force-dynamic';

interface Props {
  searchParams: Promise<{ date?: string; forbidden?: string }>;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export default async function AdminDashboardPage({ searchParams }: Props) {
  const staff = await requireRole();
  const { date: dateParam, forbidden } = await searchParams;
  const now = new Date();
  const requestedDate = dateParam ? parseDateParam(dateParam) : null;
  const day = dateOnly(requestedDate ?? now);

  await sweepDueCompletions(now);

  // Every query below is scoped to the caller's venue. Unscoped, this page
  // showed one venue's staff the whole platform's schedule, pending-payment
  // queue, customer count and month-to-date revenue.
  const { venueId } = staff;

  const [bookings, pendingVerificationCount, monthReport, totalCustomers] = await Promise.all([
    prisma.booking.findMany({
      where: { venueId, date: day, status: { in: ['HELD', 'PENDING_VERIFICATION', 'CONFIRMED', 'COMPLETED'] } },
      include: { customer: true },
    }),
    prisma.booking.count({ where: { venueId, status: 'PENDING_VERIFICATION' } }),
    // Powers both "This month" below and (by picking today's own bucket
    // out of the day-granularity breakdown) "Today's bookings/revenue" -
    // one query instead of three, and it's the exact same buildReport()
    // /admin/reports renders, so the two pages can never disagree.
    buildReport(venueId, startOfMonth(now), now, 'day'),
    // Customer is a global table by design, so "total customers" has to
    // mean "customers who have booked HERE" - a bare count() is every
    // customer on the platform.
    prisma.customer.count({ where: { bookings: { some: { venueId } } } }),
  ]);
  const bookingBySlot = new Map(bookings.map((b) => [b.slotIndex, b]));
  const todayBucket = monthReport.revenueByBucket.find((b) => b.key === formatDateParam(day));

  const isToday = dateOnly(now).getTime() === day.getTime();
  const highlightIndex = isToday ? currentSlotIndex(now) : null;

  return (
    <div className="flex flex-col gap-6">
      {forbidden ? (
        <div className="rounded-(--radius-card) border border-danger/30 bg-surface-muted px-4 py-3 text-body text-danger">
          You don&apos;t have permission to view that page.
        </div>
      ) : null}

      {pendingVerificationCount > 0 ? (
        <Link
          href="/admin/bookings?status=PENDING_VERIFICATION"
          className="flex items-center justify-between rounded-(--radius-card) border border-warning/30 bg-surface-muted px-4 py-3 text-body text-warning hover:bg-accent-soft/40"
        >
          <span>
            {pendingVerificationCount} booking{pendingVerificationCount === 1 ? '' : 's'} awaiting payment
            verification
          </span>
          <span className="text-caption underline">Review →</span>
        </Link>
      ) : null}

      <div>
        <h1 className="text-display text-text">Dashboard</h1>
        <p className="mt-1 text-body text-text-muted">A snapshot of the business, then today&apos;s schedule.</p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard label="Today's bookings" value={String(todayBucket?.count ?? 0)} icon={CalendarCheck} />
        <StatCard label="Today's revenue" value={formatBDT(todayBucket?.revenue ?? 0)} icon={Wallet} />
        <StatCard label="This month" value={String(monthReport.totalBookings)} icon={TrendingUp} />
        <StatCard label="Awaiting payment" value={String(pendingVerificationCount)} icon={Clock3} />
        <StatCard label="Total customers" value={String(totalCustomers)} icon={Users2} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-heading text-text">{isToday ? "Today's schedule" : formatDateLong(day)}</h2>
          {isToday ? <p className="mt-1 text-caption text-text-muted">{formatDateLong(day)}</p> : null}
        </div>
        <div className="flex items-center gap-1 text-caption">
          <Link
            href={`/admin?date=${formatDateParam(addDays(day, -1))}`}
            aria-label="Previous day"
            className="flex size-8 items-center justify-center rounded-(--radius-input) text-text-muted transition-colors hover:bg-surface-muted hover:text-text"
          >
            <ChevronLeft className="size-4" aria-hidden="true" />
          </Link>
          <Link
            href="/admin"
            className="rounded-(--radius-input) px-3 py-1.5 font-medium text-text transition-colors hover:bg-surface-muted"
          >
            Today
          </Link>
          <Link
            href={`/admin?date=${formatDateParam(addDays(day, 1))}`}
            aria-label="Next day"
            className="flex size-8 items-center justify-center rounded-(--radius-input) text-text-muted transition-colors hover:bg-surface-muted hover:text-text"
          >
            <ChevronRight className="size-4" aria-hidden="true" />
          </Link>
          <span className="mx-1 h-4 w-px bg-border" aria-hidden="true" />
          <Link
            href="/admin/calendar"
            className="rounded-(--radius-input) px-3 py-1.5 font-medium text-text transition-colors hover:bg-surface-muted"
          >
            Calendar →
          </Link>
        </div>
      </div>

      <div className="overflow-hidden rounded-(--radius-card) border border-border bg-surface shadow-(--shadow-elevated)">
        {ALL_SLOT_INDEXES.map((index) => {
          const booking = bookingBySlot.get(index);
          const isCurrent = index === highlightIndex;
          const maintenance = isMaintenanceSlot(index);

          return (
            <div
              key={index}
              className={cn(
                'relative flex flex-wrap items-center gap-3 border-b border-border px-4 py-3 transition-colors last:border-b-0',
                isCurrent ? 'bg-accent-soft/60' : 'hover:bg-surface-muted',
              )}
            >
              {/* Same left-accent-stripe language sidebar-nav.tsx uses for
               * "this is the active one" — one visual grammar for "current"
               * across the whole dashboard, not a background tint here and
               * a bar there. Background tint alone still satisfies "state is
               * never colour-only" via the row's own time label; this is
               * added emphasis, not the only cue. */}
              {isCurrent ? (
                <span className="absolute inset-y-0 left-0 w-1 rounded-r-full bg-accent" aria-hidden="true" />
              ) : null}
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
                    ) : booking.status === 'PENDING_VERIFICATION' ? (
                      <span className="text-caption text-warning">Awaiting payment</span>
                    ) : booking.status === 'HELD' ? (
                      <span className="text-caption text-text-muted">Held</span>
                    ) : null}
                  </div>
                </>
              ) : (
                // text-text, not text-muted, when this is the highlighted
                // current slot: text-muted (#6B7280) on bg-accent-soft
                // measures 4.4:1, just under WCAG AA's 4.5:1 - same fix as
                // /admin/calendar's isToday cells.
                <div className={cn('flex-1 text-body', isCurrent ? 'text-text' : 'text-text-muted')}>Free</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
