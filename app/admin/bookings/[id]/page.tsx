/**
 * ROUTE: /admin/bookings/[id] — staff (ADMIN or MODERATOR).
 *
 * One booking's full detail and every action that can be taken on it:
 * check in, mark no-show, cancel (all through ConfirmDialog, restating the
 * booking), record a payment, reschedule, and edit the internal note.
 * Each control only renders when the booking's current status permits
 * that transition (see CLAUDE.md §5's transition table).
 */
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { formatBDT, formatDateLong, formatDateParam } from '@/lib/format';
import { hasSlotStarted, slotLabel, type SlotIndex } from '@/lib/slots';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BookingStatusBadge } from '@/components/admin/booking-status-badge';
import { PaymentBadge } from '@/components/admin/payment-badge';
import { BookingActions } from '@/components/admin/booking-actions';
import { RecordPaymentForm } from '@/components/admin/record-payment-form';
import { RescheduleForm } from '@/components/admin/reschedule-form';
import { InternalNoteForm } from '@/components/admin/internal-note-form';
import { VerifyPaymentForm } from '@/components/admin/verify-payment-form';
import { getDefaultVenueId } from '@/lib/tenant';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function AdminBookingDetailPage({ params }: Props) {
  const { id } = await params;
  const [booking, venue] = await Promise.all([
    prisma.booking.findUnique({
      where: { id },
      include: { customer: true, payments: { orderBy: { receivedAt: 'desc' } }, createdBy: true },
    }),
    prisma.venue.findUnique({ where: { id: await getDefaultVenueId() } }),
  ]);
  if (!booking) notFound();

  const slotHasStarted = hasSlotStarted(booking.date, booking.slotIndex as SlotIndex, new Date());
  const balance = Number(booking.priceAmount) - Number(booking.amountPaid);
  const pendingClaim =
    booking.status === 'PENDING_VERIFICATION'
      ? booking.payments.find((p) => p.status === 'PENDING')
      : undefined;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-display text-text">{booking.reference}</h1>
          <p className="mt-1 text-body text-text-muted">
            {formatDateLong(booking.date)} · {slotLabel(booking.slotIndex as SlotIndex)}
          </p>
        </div>
        <BookingStatusBadge status={booking.status} />
      </div>

      <BookingActions
        bookingId={booking.id}
        reference={booking.reference}
        status={booking.status}
        checkedInAt={booking.checkedInAt?.toISOString() ?? null}
        slotHasStarted={slotHasStarted}
      />

      {pendingClaim ? (
        <Card className="rounded-(--radius-card) border-warning/30">
          <CardHeader>
            <CardTitle className="text-heading text-text">Verify payment</CardTitle>
          </CardHeader>
          <CardContent>
            <VerifyPaymentForm
              bookingId={booking.id}
              reference={booking.reference}
              trxId={pendingClaim.trxId ?? ''}
              amount={pendingClaim.amount.toString()}
              bkashNumber={venue?.bkashNumber ?? ''}
            />
          </CardContent>
        </Card>
      ) : null}

      <Card className="rounded-(--radius-card)">
        <CardHeader>
          <CardTitle className="text-heading text-text">Customer</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-body text-text">
          <div className="flex justify-between">
            <span className="text-text-muted">Name</span>
            <span>{booking.customer.fullName}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-muted">Phone</span>
            <span className="tabular-nums">{booking.customer.phone}</span>
          </div>
          {booking.customer.email ? (
            <div className="flex justify-between">
              <span className="text-text-muted">Email</span>
              <span>{booking.customer.email}</span>
            </div>
          ) : null}
          {booking.customer.address ? (
            <div className="flex justify-between gap-4">
              <span className="shrink-0 text-text-muted">Address</span>
              <span className="text-right">{booking.customer.address}</span>
            </div>
          ) : null}
          {booking.customer.teamName ? (
            <div className="flex justify-between">
              <span className="text-text-muted">Team</span>
              <span>{booking.customer.teamName}</span>
            </div>
          ) : null}
          {booking.customerNote ? (
            <div className="mt-2 rounded-(--radius-input) bg-surface-muted p-3 text-caption text-text-muted">
              &ldquo;{booking.customerNote}&rdquo;
            </div>
          ) : null}
          <div className="flex justify-between">
            <span className="text-text-muted">Source</span>
            <span>{booking.source === 'COUNTER' ? `Counter (${booking.createdBy?.name ?? 'unknown staff'})` : 'Online'}</span>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-(--radius-card)">
        <CardHeader>
          <CardTitle className="text-heading text-text">Payment</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-body text-text">
            <span className="text-text-muted">Price</span>
            <span className="tabular-nums">{formatBDT(booking.priceAmount.toString())}</span>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 text-body text-text">
            <span className="text-text-muted">Paid</span>
            <span className="tabular-nums">{formatBDT(booking.amountPaid.toString())}</span>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 text-body text-text">
            <span className="text-text-muted">Balance</span>
            <span className="tabular-nums">{formatBDT(Math.max(balance, 0))}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-caption text-text-muted">Status</span>
            <PaymentBadge status={booking.paymentStatus} />
          </div>

          {booking.payments.length > 0 ? (
            <ul className="flex flex-col gap-1 border-t border-border pt-3 text-caption text-text-muted">
              {booking.payments.map((p) => (
                <li key={p.id} className="flex justify-between tabular-nums">
                  <span>
                    {p.method.replace('_', ' ')}
                    {p.status !== 'VERIFIED' ? ` (${p.status.toLowerCase()})` : ''}
                    {p.note ? ` (${p.note})` : ''}
                  </span>
                  <span>{formatBDT(p.amount.toString())}</span>
                </li>
              ))}
            </ul>
          ) : null}

          {booking.status !== 'CANCELLED' && booking.status !== 'PENDING_VERIFICATION' ? (
            <div className="border-t border-border pt-3">
              <RecordPaymentForm bookingId={booking.id} />
            </div>
          ) : null}
        </CardContent>
      </Card>

      {booking.status === 'CONFIRMED' ? (
        <Card className="rounded-(--radius-card)">
          <CardHeader>
            <CardTitle className="text-heading text-text">Reschedule</CardTitle>
          </CardHeader>
          <CardContent>
            <RescheduleForm
              bookingId={booking.id}
              currentDate={formatDateParam(booking.date)}
              currentSlotIndex={booking.slotIndex}
            />
          </CardContent>
        </Card>
      ) : null}

      <Card className="rounded-(--radius-card)">
        <CardHeader>
          <CardTitle className="text-heading text-text">Internal note</CardTitle>
        </CardHeader>
        <CardContent>
          <InternalNoteForm bookingId={booking.id} initialNote={booking.internalNote ?? ''} />
        </CardContent>
      </Card>
    </div>
  );
}
