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

  // Only CONFIRMED bookings render a receipt — a reference that is still
  // HELD, or belongs to someone else's expired/cancelled attempt, is not a
  // real confirmation to show.
  const booking = await prisma.booking.findUnique({ where: { reference: ref } });
  if (!booking || booking.status !== 'CONFIRMED') notFound();

  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-[560px] flex-1 px-4 py-8">
        <div className="mb-6 rounded-(--radius-card) border border-accent/30 bg-accent-soft px-4 py-3 text-body font-medium text-accent">
          Booking confirmed
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
