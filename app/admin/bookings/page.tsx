import Link from 'next/link';
import { Prisma, type BookingStatus } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { dateOnly } from '@/lib/availability-service';
import { parseDateParam, formatBDT, formatDateShort } from '@/lib/format';
import { slotLabel, type SlotIndex } from '@/lib/slots';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { BookingStatusBadge } from '@/components/admin/booking-status-badge';
import { BookingsFilterForm } from '@/components/admin/bookings-filter-form';

export const dynamic = 'force-dynamic';

interface Props {
  searchParams: Promise<{
    q?: string;
    phone?: string;
    status?: string;
    from?: string;
    to?: string;
  }>;
}

const PAGE_SIZE = 50;

export default async function AdminBookingsPage({ searchParams }: Props) {
  const params = await searchParams;
  const q = params.q?.trim() ?? '';
  const phone = params.phone?.trim() ?? '';
  const status = params.status?.trim() ?? '';
  const from = params.from ? parseDateParam(params.from) : null;
  const to = params.to ? parseDateParam(params.to) : null;

  const where: Prisma.BookingWhereInput = {
    ...(q ? { OR: [{ reference: { contains: q, mode: 'insensitive' } }, { customer: { fullName: { contains: q, mode: 'insensitive' } } }] } : {}),
    ...(phone ? { customer: { phone: { contains: phone } } } : {}),
    ...(status ? { status: status as BookingStatus } : {}),
    ...(from || to
      ? {
          date: {
            ...(from ? { gte: dateOnly(from) } : {}),
            ...(to ? { lte: dateOnly(to) } : {}),
          },
        }
      : {}),
  };

  const bookings = await prisma.booking.findMany({
    where,
    include: { customer: true },
    orderBy: [{ date: 'desc' }, { slotIndex: 'desc' }],
    take: PAGE_SIZE,
  });

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-display text-text">Bookings</h1>
        <Button asChild>
          <Link href="/admin/bookings/new">New counter booking</Link>
        </Button>
      </div>

      <div className="mt-6">
        <BookingsFilterForm defaultValues={{ q, phone, status, from: params.from ?? '', to: params.to ?? '' }} />
      </div>

      <div className="mt-6 overflow-x-auto rounded-(--radius-card) border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Reference</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Time</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Price</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {bookings.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-body text-text-muted">
                  No bookings match these filters.
                </TableCell>
              </TableRow>
            ) : (
              bookings.map((b) => (
                <TableRow key={b.id}>
                  <TableCell>
                    <Link href={`/admin/bookings/${b.id}`} className="font-medium text-accent hover:underline">
                      {b.reference}
                    </Link>
                  </TableCell>
                  <TableCell className="tabular-nums">{formatDateShort(b.date)}</TableCell>
                  <TableCell className="tabular-nums">{slotLabel(b.slotIndex as SlotIndex)}</TableCell>
                  <TableCell>{b.customer.fullName}</TableCell>
                  <TableCell className="tabular-nums">{b.customer.phone}</TableCell>
                  <TableCell>
                    <BookingStatusBadge status={b.status} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatBDT(b.priceAmount.toString())}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {bookings.length === PAGE_SIZE ? (
        <p className="mt-3 text-caption text-text-muted">
          Showing the first {PAGE_SIZE} results. Narrow your filters to see more precisely.
        </p>
      ) : null}
    </div>
  );
}
