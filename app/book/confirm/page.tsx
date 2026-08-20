import Link from 'next/link';
import { redirect } from 'next/navigation';
import { SiteHeader } from '@/components/site/header';
import { SiteFooter } from '@/components/site/footer';
import { ConfirmForm } from '@/components/booking/confirm-form';
import { prisma } from '@/lib/prisma';
import { formatBDT, formatDateLong } from '@/lib/format';
import { slotLabel, type SlotIndex } from '@/lib/slots';

export const dynamic = 'force-dynamic';

interface Props {
  searchParams: Promise<{ holdId?: string; date?: string; slotIndex?: string }>;
}

export default async function ConfirmPage({ searchParams }: Props) {
  const { holdId, date: dateParam, slotIndex: slotIndexParam } = await searchParams;

  if (!holdId || !dateParam || slotIndexParam === undefined) {
    redirect('/book');
  }

  const booking = await prisma.booking.findUnique({ where: { id: holdId } });
  const now = new Date();
  const isValidHold = !!(
    booking &&
    booking.status === 'HELD' &&
    booking.holdExpiresAt &&
    booking.holdExpiresAt.getTime() > now.getTime()
  );

  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-[560px] flex-1 px-4 py-8">
        <h1 className="text-display text-text">Confirm your booking</h1>

        {!isValidHold ? (
          <div className="mt-6 rounded-(--radius-card) border border-warning/30 bg-surface-muted p-4 text-body text-warning">
            This hold has expired or was not found. Please pick a slot again.
            <div className="mt-3">
              <Link href={`/book/${dateParam}`} className="font-medium text-accent underline">
                Choose a slot
              </Link>
            </div>
          </div>
        ) : (
          <>
            <p className="mt-1 text-body text-text-muted">
              {formatDateLong(booking.date)} · {slotLabel(booking.slotIndex as SlotIndex)} ·{' '}
              {formatBDT(booking.priceAmount.toString())}
            </p>
            <ConfirmForm
              holdId={booking.id}
              date={dateParam}
              slotIndex={booking.slotIndex}
              holdExpiresAt={booking.holdExpiresAt!.toISOString()}
            />
          </>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
