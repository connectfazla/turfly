/**
 * ROUTE: /rules — public, no login.
 *
 * Plain informational page: booking policy plus the venue's own text
 * (Venue.rulesText, editable from the database so the owner can update it
 * without a redeploy) and contact details.
 */
import { SiteHeader } from '@/components/site/header';
import { SiteFooter } from '@/components/site/footer';
import { prisma } from '@/lib/prisma';
import { MAINTENANCE_SLOT, slotLabel } from '@/lib/slots';
import { getRequestVenueId } from '@/lib/request-venue';

export const dynamic = 'force-dynamic';

export default async function RulesPage() {
  const venue = await prisma.venue.findUnique({ where: { id: await getRequestVenueId() } });

  const holdMinutes = venue?.holdMinutes ?? 10;
  const cancellationWindowHours = venue?.cancellationWindowHours ?? 6;
  const bookingWindowDays = venue?.bookingWindowDays ?? 14;

  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-[720px] flex-1 px-4 py-8">
        <h1 className="text-display text-text">Booking rules</h1>
        {venue ? <p className="mt-1 text-body text-text-muted">{venue.name}</p> : null}

        <ul className="mt-6 flex flex-col gap-3 text-body text-text">
          <li>Each booking is one 90-minute slot.</li>
          <li>
            The pitch is closed for maintenance every day from {slotLabel(MAINTENANCE_SLOT)}. This
            slot is never bookable.
          </li>
          <li>A slot is held for you for {holdMinutes} minutes while you complete the form.</li>
          <li>You may have at most 2 active bookings at a time online.</li>
          <li>
            Online cancellation is available up to {cancellationWindowHours} hours before your slot
            starts. After that, please contact the venue directly.
          </li>
          <li>You can book up to {bookingWindowDays} days in advance.</li>
          <li>All prices are in BDT and shown before you confirm.</li>
        </ul>

        {venue?.rulesText ? (
          <p className="mt-6 whitespace-pre-line text-body text-text-muted">{venue.rulesText}</p>
        ) : null}

        {venue?.contactPhone ? (
          <p className="mt-6 text-body text-text">
            Questions? Call <span className="tabular-nums">{venue.contactPhone}</span>
            {venue.contactEmail ? <> or email {venue.contactEmail}</> : null}.
          </p>
        ) : null}
      </main>
      <SiteFooter />
    </div>
  );
}
