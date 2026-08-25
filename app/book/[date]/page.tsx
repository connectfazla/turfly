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
import { FieldSwitcher, getActiveFields } from '@/components/booking/field-picker';
import type { PublicSlotView } from '@/components/booking/types';
import { fetchDayAvailability } from '@/lib/availability-service';
import { prisma } from '@/lib/prisma';
import { formatDateLong, formatDateParam, parseDateParam } from '@/lib/format';
import { clampToBookingWindow, isWithinBookingWindow } from '@/lib/booking-window';
import { getRequestVenue } from '@/lib/request-venue';
import { getDefaultFieldId } from '@/lib/field';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ date: string }>;
  searchParams: Promise<{ field?: string }>;
}

export default async function BookDatePage({ params, searchParams }: Props) {
  const { date: dateParam } = await params;
  const { field: fieldParam } = await searchParams;
  const date = parseDateParam(dateParam);
  if (!date) notFound();

  const now = new Date();
  if (!isWithinBookingWindow(date, now)) {
    redirect(`/book/${formatDateParam(clampToBookingWindow(date, now))}${fieldParam ? `?field=${fieldParam}` : ''}`);
  }

  // Resolved from the request host, same as every other public booking
  // route — this page previously called fetchDayAvailability with NEITHER
  // a venueId NOR a fieldId, so every venue's /book/[date] silently showed
  // Venue Zero's schedule regardless of subdomain. Fixed in the same pass
  // that threads fieldId through, since it's the same line.
  const venue = await getRequestVenue();
  const fields = await getActiveFields(venue.id);
  // The field param is attacker-controlled (a query string) — only trust it
  // if it's genuinely one of this venue's own active fields, exactly the
  // same "never trust, always re-derive" shape lib/auth/active-venue.ts
  // uses for the admin side's venue cookie.
  const fieldId =
    (fieldParam && fields.some((f) => f.id === fieldParam) ? fieldParam : null) ??
    fields[0]?.id ??
    (await getDefaultFieldId(prisma, venue.id));

  const { slots } = await fetchDayAvailability(prisma, date, now, undefined, venue.id, fieldId);
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

        {fields.length > 1 ? (
          <div className="mt-4">
            <FieldSwitcher fields={fields} selectedFieldId={fieldId} dateParam={dateParam} />
          </div>
        ) : null}

        <div className="mt-6">
          <DateStrip selected={dateParam} fieldId={fieldId} />
        </div>

        <div className="mt-6">
          <SlotGrid date={dateParam} fieldId={fieldId} initialSlots={publicSlots} />
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
