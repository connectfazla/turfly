/**
 * ROUTE: /admin/customers — staff (ADMIN or MODERATOR).
 *
 * Every Customer (public visitors keyed by phone, never Users - CLAUDE.md
 * §5) with their lifetime booking total, no-show count, and a block /
 * unblock control. A blocked customer is refused new bookings on the
 * public page (see CustomerBlockedError in lib/booking-engine.ts) but
 * staff can still book for them at the counter.
 */
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { CustomerBlockControl } from '@/components/admin/customer-block-control';
import { CustomerSearchForm } from '@/components/admin/customer-search-form';
import { requireRole } from '@/lib/auth/require-role';

export const dynamic = 'force-dynamic';

interface Props {
  searchParams: Promise<{ q?: string }>;
}

export default async function AdminCustomersPage({ searchParams }: Props) {
  const { q } = await searchParams;
  const query = q?.trim() ?? '';

  // Owner + Manager: the customer list carries booking history and block
  // status, and blocking somebody is a commercial decision, not a
  // counter-desk one.
  const staff = await requireRole('OWNER', 'MANAGER');
  // Customer is global by design (phone-unique, so a customer's bookings can
  // span venues), which makes an unfiltered list every customer on the
  // platform. "Ours" = has booked here.
  const venueScope: Prisma.CustomerWhereInput = { bookings: { some: { venueId: staff.venueId } } };
  const searchWhere: Prisma.CustomerWhereInput = query
    ? { OR: [{ fullName: { contains: query, mode: 'insensitive' } }, { phone: { contains: query } }] }
    : {};

  const customers = await prisma.customer.findMany({
    where: { AND: [venueScope, searchWhere] },
    orderBy: { totalBookings: 'desc' },
    take: 100,
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-display text-text">Customers</h1>
        <p className="mt-1 text-body text-text-muted">History, totals, and blocking.</p>
      </div>

      <CustomerSearchForm defaultValue={query} />

      <div className="overflow-x-auto rounded-(--radius-card) border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead className="text-right">Bookings</TableHead>
              <TableHead className="text-right">No-shows</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {customers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-body text-text-muted">
                  No customers match that search.
                </TableCell>
              </TableRow>
            ) : (
              customers.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>{c.fullName}</TableCell>
                  <TableCell className="tabular-nums">{c.phone}</TableCell>
                  <TableCell className="text-right tabular-nums">{c.totalBookings}</TableCell>
                  <TableCell className="text-right tabular-nums">{c.totalNoShows}</TableCell>
                  <TableCell>
                    {c.isBlocked ? (
                      <Badge variant="outline" className="rounded-(--radius-input) border-danger/30 bg-surface-muted text-danger">
                        Blocked
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="rounded-(--radius-input) border-border text-text-muted">
                        Active
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <CustomerBlockControl customerId={c.id} customerName={c.fullName} isBlocked={c.isBlocked} />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
