import { CounterBookingForm } from '@/components/admin/counter-booking-form';

export default function NewCounterBookingPage() {
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
