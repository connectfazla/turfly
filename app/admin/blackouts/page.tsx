/**
 * ROUTE: /admin/blackouts — staff (ADMIN or MODERATOR).
 *
 * Close the whole day or a single slot ahead of time (CLAUDE.md §2
 * invariant 8: "Blackouts override availability"). Creating one shows a
 * warning listing any existing live bookings it would affect, but never
 * cancels them automatically — staff decide what to do with those
 * separately from /admin/bookings.
 */
import { prisma } from '@/lib/prisma';
import { formatDateLong } from '@/lib/format';
import { slotLabel, type SlotIndex } from '@/lib/slots';
import { CreateBlackoutForm } from '@/components/admin/create-blackout-form';
import { DeleteBlackoutButton } from '@/components/admin/delete-blackout-button';
import { requireRole } from '@/lib/auth/require-role';

export const dynamic = 'force-dynamic';

export default async function AdminBlackoutsPage() {
  const staff = await requireRole();
  const blackouts = await prisma.blackout.findMany({
    where: { venueId: staff.venueId, date: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } },
    include: { createdBy: true },
    orderBy: [{ date: 'asc' }, { slotIndex: 'asc' }],
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-display text-text">Blackouts</h1>
        <p className="mt-1 text-body text-text-muted">
          Close the whole day or a single slot. Blackouts override normal availability.
        </p>
      </div>

      <CreateBlackoutForm />

      <div className="overflow-hidden rounded-(--radius-card) border border-border">
        {blackouts.length === 0 ? (
          <p className="px-4 py-6 text-center text-body text-text-muted">No upcoming blackouts.</p>
        ) : (
          blackouts.map((b) => (
            <div
              key={b.id}
              className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3 last:border-b-0"
            >
              <div>
                <div className="text-body text-text">
                  {formatDateLong(b.date)} ·{' '}
                  {b.slotIndex === null ? 'Whole day' : slotLabel(b.slotIndex as SlotIndex)}
                </div>
                <div className="text-caption text-text-muted">
                  {b.reason} · by {b.createdBy.name}
                </div>
              </div>
              <DeleteBlackoutButton
                id={b.id}
                label={`${formatDateLong(b.date)} · ${b.slotIndex === null ? 'Whole day' : slotLabel(b.slotIndex as SlotIndex)}`}
              />
            </div>
          ))
        )}
      </div>
    </div>
  );
}
