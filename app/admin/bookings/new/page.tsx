/**
 * ROUTE: /admin/bookings/new — staff (ADMIN or MODERATOR).
 *
 * The counter-booking form: staff book directly on behalf of a walk-in or
 * phone customer. Goes straight to CONFIRMED (no HELD step, unlike the
 * public flow) and, unlike the public flow, does not count toward the
 * customer's 2-active-booking limit (CLAUDE.md §2 invariant 6).
 */
import { CounterBookingForm } from '@/components/admin/counter-booking-form';
import { requireRole } from '@/lib/auth/require-role';

export default async function NewCounterBookingPage() {
  // Any staff role may take a counter booking — that is a Bookie's core job.
  // The guard is here rather than left to the layout because CLAUDE.md §7
  // requires every route to re-check: a layout is not an authorisation
  // boundary, and this page was the one /admin route without its own.
  await requireRole();

  return (
    <div>
      <h1 className="text-display text-text">New counter booking</h1>
      <p className="mt-1 text-body text-text-muted">
        For walk-ins and phone bookings. This does not count against the customer&apos;s 2-booking
        limit.
      </p>
      <div className="mt-6">
        <CounterBookingForm />
      </div>
    </div>
  );
}
