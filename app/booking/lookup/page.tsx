/**
 * ROUTE: /booking/lookup — public, no login.
 *
 * Retrieve a booking by reference + phone (both required - this is the
 * only public authentication a Customer ever gets, since Customers never
 * have accounts). Also the entry point for public cancellation, when the
 * slot is still more than 6 hours away. A wrong reference, wrong phone,
 * or a booking outside the cancellation window all produce the SAME
 * generic message (see lib/schemas + app/actions/bookings.ts), so a
 * failed lookup never reveals whether a reference exists at all.
 */
import { SiteHeader } from '@/components/site/header';
import { SiteFooter } from '@/components/site/footer';
import { LookupForm } from '@/components/booking/lookup-form';

export default function BookingLookupPage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-[560px] flex-1 px-4 py-8">
        <h1 className="text-display text-text">Find your booking</h1>
        <p className="mt-1 text-body text-text-muted">
          Enter your reference and the phone number you booked with.
        </p>
        <div className="mt-6">
          <LookupForm />
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
