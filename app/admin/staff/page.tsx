/**
 * ROUTE: /admin/staff — OWNER only.
 *
 * Replaces the password-based /admin/users deleted in the Clerk cutover.
 * Different in substance, not just in styling: this grants access to ONE
 * venue, and it never creates credentials — Clerk emails an invitation and
 * the person sets up their own account.
 */
import { requireRole } from '@/lib/auth/require-role';
import { prisma } from '@/lib/prisma';
import { formatDateLong } from '@/lib/format';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { InviteStaffForm } from '@/components/admin/invite-staff-form';
import { StaffRowControls } from '@/components/admin/staff-row-controls';

export const dynamic = 'force-dynamic';

export default async function StaffPage() {
  const owner = await requireRole('OWNER');

  const [staff, venue] = await Promise.all([
    prisma.venueStaff.findMany({
      where: { venueId: owner.venueId },
      orderBy: [{ isActive: 'desc' }, { createdAt: 'asc' }],
      include: { user: { select: { id: true, name: true, email: true, passwordHash: true, lastLoginAt: true } } },
    }),
    prisma.venue.findUnique({ where: { id: owner.venueId }, select: { name: true } }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-display text-text">Staff</h1>
        <p className="mt-1 text-body text-text-muted">
          Who can work the counter at {venue?.name}. You are the owner and are not listed here.
        </p>
      </div>

      <div className="rounded-(--radius-card) border border-border bg-surface p-5">
        <h2 className="text-subheading text-text">Add someone</h2>
        <p className="mt-1 text-caption text-text-muted">
          <strong className="font-medium text-text">Manager</strong> handles payments and sees reports.{' '}
          <strong className="font-medium text-text">Bookie</strong> takes bookings and checks players in, and cannot
          see any money.
        </p>
        <div className="mt-4">
          <InviteStaffForm />
        </div>
      </div>

      {staff.length === 0 ? (
        <div className="rounded-(--radius-card) border border-border bg-surface px-4 py-12 text-center">
          <p className="text-body text-text">No staff yet</p>
          <p className="mt-1 text-caption text-text-muted">
            Add the people who work your counter so they stop sharing one login.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-(--radius-card) border border-border bg-surface">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last seen</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {staff.map((s) => (
                <TableRow key={s.id} className={s.isActive ? undefined : 'opacity-60'}>
                  <TableCell>
                    <div className="text-body text-text">{s.user.name}</div>
                    <div className="text-caption text-text-muted">{s.user.email}</div>
                  </TableCell>
                  <TableCell>
                    <Badge className="bg-surface-muted text-text-muted">
                      {s.role === 'MANAGER' ? 'Manager' : 'Bookie'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {!s.isActive ? (
                      <span className="text-caption text-text-muted">Deactivated</span>
                    ) : s.user.passwordHash ? (
                      <span className="text-caption text-accent">Active</span>
                    ) : (
                      // The state that confuses owners most, so it is named
                      // explicitly rather than shown as "inactive".
                      <span className="text-caption text-warning">Invited, not signed in</span>
                    )}
                  </TableCell>
                  <TableCell className="text-caption text-text-muted">
                    {s.user.lastLoginAt ? formatDateLong(s.user.lastLoginAt) : '—'}
                  </TableCell>
                  <TableCell className="text-right">
                    <StaffRowControls userId={s.user.id} role={s.role} isActive={s.isActive} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
