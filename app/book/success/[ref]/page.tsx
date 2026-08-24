/**
 * ROUTE: /book/success/[ref] — public, no login (ref is the booking
 * reference, e.g. TRF-2026-0001).
 *
 * The receipt shown right after the confirm form is submitted. Renders
 * for PENDING_VERIFICATION (the normal case now — the booking is not
 * CONFIRMED yet, staff still have to verify the bKash advance) and for
 * CONFIRMED (a counter booking, or a rare same-second race where staff
 * already verified it). A HELD, cancelled, or nonexistent reference
 * 404s, since this page is a one-time landing after submission, not a
 * general booking viewer (that's /booking/lookup, which requires the
 * phone number too).
 */
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { SiteHeader } from '@/components/site/header';
import { SiteFooter } from '@/components/site/footer';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { prisma } from '@/lib/prisma';
import { formatBDT, formatDateLong } from '@/lib/format';
import { slotLabel, type SlotIndex } from '@/lib/slots';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ ref: string }>;
}

export default async function BookingSuccessPage({ params }: Props) {
  const { ref } = await params;

  // Only PENDING_VERIFICATION or CONFIRMED bookings render a receipt — a
  // reference that is still HELD, or belongs to someone else's expired/
  // cancelled attempt, is not a real submission to show.
  const booking = await prisma.booking.findUnique({ where: { reference: ref } });
  if (!booking || (booking.status !== 'PENDING_VERIFICATION' && booking.status !== 'CONFIRMED')) notFound();
  const pending = booking.status === 'PENDING_VERIFICATION';

  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-[560px] flex-1 px-4 py-8">
        <div
          className={
            pending
              ? 'mb-6 rounded-(--radius-card) border border-warning/30 bg-surface-muted px-4 py-3 text-body font-medium text-warning'
              : 'mb-6 rounded-(--radius-card) border border-accent/30 bg-accent-soft px-4 py-3 text-body font-medium text-accent'
          }
        >
          {pending
            ? "Reserved — verifying your payment. We'll confirm once staff check your bKash TRXN."
            : 'Booking confirmed'}
        </div>

        <Card className="rounded-(--radius-card)">
          <CardHeader>
            <CardTitle className="text-heading text-text">{booking.reference}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-body text-text">
            <div className="flex justify-between">
              <span className="text-text-muted">Date</span>
              <span>{formatDateLong(booking.date)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-muted">Time</span>
              <span className="tabular-nums">{slotLabel(booking.slotIndex as SlotIndex)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-muted">Price</span>
              <span className="tabular-nums">{formatBDT(booking.priceAmount.toString())}</span>
            </div>
          </CardContent>
        </Card>

        <p className="mt-4 text-caption text-text-muted">
          Save your reference. You&apos;ll need it with your phone number to look up or cancel this
          booking.
        </p>

        <div className="mt-6 flex gap-3">
          <Button asChild>
            <Link href="/book">Book another slot</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/booking/lookup">Find a booking</Link>
          </Button>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
