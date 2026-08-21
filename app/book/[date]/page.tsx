/**
 * ROUTE: /book/[date] — public, no login (date param is yyyy-MM-dd).
 *
 * This is the ONE real implementation of the booking page; /book just
 * redirects here with today's date. Renders the DateStrip and SlotGrid
 * for first paint as a Server Component (no client fetch waterfall,
 * CLAUDE.md §4) using fetchDayAvailability(), the same function every
 * other availability display in the app uses. Out-of-window dates (past,
 * or beyond BOOKING_WINDOW_DAYS) redirect back to the nearest valid date.
 */
import { notFound, redirect } from 'next/navigation';
import { SiteHeader } from '@/components/site/header';
import { SiteFooter } from '@/components/site/footer';
import { DateStrip } from '@/components/booking/date-strip';
import { SlotGrid } from '@/components/booking/slot-grid';
import type { PublicSlotView } from '@/components/booking/types';
import { fetchDayAvailability } from '@/lib/availability-service';
import { prisma } from '@/lib/prisma';
import { formatDateLong, formatDateParam, parseDateParam } from '@/lib/format';
import { clampToBookingWindow, isWithinBookingWindow } from '@/lib/booking-window';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ date: string }>;
}

export default async function BookDatePage({ params }: Props) {
  const { date: dateParam } = await params;
  const date = parseDateParam(dateParam);
  if (!date) notFound();

  const now = new Date();
  if (!isWithinBookingWindow(date, now)) {
    redirect(`/book/${formatDateParam(clampToBookingWindow(date, now))}`);
  }

  const { slots } = await fetchDayAvailability(prisma, date, now);
  const publicSlots: PublicSlotView[] = slots.map((s) => ({
    index: s.index,
    label: s.label,
    state: s.state,
    price: s.price,
  }));

  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-[1120px] flex-1 px-4 py-8">
        <h1 className="text-display text-text">Book a slot</h1>
        <p className="mt-1 text-body text-text-muted">{formatDateLong(date)}</p>

        <div className="mt-6">
          <DateStrip selected={dateParam} />
        </div>

        <div className="mt-6">
          <SlotGrid date={dateParam} initialSlots={publicSlots} />
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
