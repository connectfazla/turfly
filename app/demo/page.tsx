/**
 * ROUTE: /demo — public, no signup, no password.
 *
 * The whole pitch: this is not a mockup. Picking a role signs the visitor
 * into the real dashboard (app/admin/*) against a seeded venue with a full
 * season of realistic activity — see scripts/create-demo-venue.ts and
 * lib/demo.ts for how that's kept safe to publish.
 */
import Link from 'next/link';
import { CalendarCheck, ShieldCheck, Wallet } from 'lucide-react';
import { getDemoVenue } from '@/lib/demo';
import { MarketingHeader } from '@/components/marketing/marketing-header';
import { MarketingFooter } from '@/components/marketing/marketing-footer';
import { DemoRolePicker } from '@/components/demo/demo-role-picker';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Live demo',
  description: 'Explore the real Turfly dashboard as an Owner, Manager, or Bookie, pre-loaded with a season of sample data. No signup required.',
  // A demo login page has nothing worth ranking, and it is not a real
  // business — keeping it out of search results is the honest default.
  robots: { index: false, follow: false },
};

const HIGHLIGHTS = [
  { icon: CalendarCheck, text: 'A real season of bookings — past, today, and upcoming' },
  { icon: Wallet, text: 'Revenue, deposits, and a payment queue to verify' },
  { icon: ShieldCheck, text: 'Three roles, so you can see exactly what each one can and cannot do' },
];

export default async function DemoPage() {
  const demo = await getDemoVenue();

  return (
    <div className="flex min-h-dvh flex-col">
      <MarketingHeader />
      <main className="flex-1 bg-surface-muted">
        <section className="mx-auto max-w-[640px] px-4 py-16 sm:py-24">
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-caption text-text-muted">
            <span aria-hidden="true" className="size-1.5 rounded-full bg-accent" />
            Live demo — sample data, no signup
          </span>

          <h1 className="mt-5 text-hero text-balance text-text">See the real dashboard, not a mockup.</h1>
          <p className="mt-4 max-w-[54ch] text-body text-text-muted">
            Pick a role below and you&apos;re straight into {demo?.venueName ?? 'a demo venue'} — the exact product an
            owner uses, pre-loaded with a season of bookings so it looks like a real business, not an empty screen.
          </p>

          <ul className="mt-8 flex flex-col gap-3">
            {HIGHLIGHTS.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-start gap-3 text-body text-text">
                <Icon className="mt-0.5 size-[18px] shrink-0 text-accent" aria-hidden="true" />
                {text}
              </li>
            ))}
          </ul>

          <div className="mt-10 rounded-(--radius-card) border border-border bg-surface p-6 shadow-(--shadow-elevated)">
            {demo ? (
              <DemoRolePicker />
            ) : (
              <p className="text-body text-text-muted">
                The demo has not been set up on this environment yet.
              </p>
            )}
          </div>

          <p className="mt-6 text-caption text-text-muted">
            This is a shared sandbox — other visitors can see the same sample data. Nothing here is a real business or
            a real payment.{' '}
            <Link href="/sign-up" className="text-accent underline underline-offset-2 hover:no-underline">
              Ready to set up your own turf?
            </Link>
          </p>
        </section>
      </main>
      <MarketingFooter />
    </div>
  );
}
