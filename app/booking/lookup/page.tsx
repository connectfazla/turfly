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
