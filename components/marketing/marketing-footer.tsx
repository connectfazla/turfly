import Link from 'next/link';

const YEAR = new Date().getFullYear();

export function MarketingFooter() {
  return (
    <footer className="border-t border-border bg-surface-muted">
      <div className="mx-auto max-w-[1120px] px-4 py-10">
        <div className="flex flex-col justify-between gap-8 sm:flex-row">
          <div className="max-w-[38ch]">
            <div className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className="flex size-6 items-center justify-center rounded-md bg-accent text-caption font-semibold text-white"
              >
                T
              </span>
              <span className="text-body font-semibold text-text">Turfly</span>
            </div>
            <p className="mt-2 text-caption text-text-muted">
              Booking software for turf owners in Bangladesh. Take bookings online and at the counter, verify bKash
              deposits, and see what the pitch actually earned.
            </p>
          </div>

          <nav aria-label="Footer" className="flex gap-12">
            <div className="flex flex-col">
              <h2 className="pb-1 text-caption font-medium text-text">Product</h2>
              <Link href="#features" className="inline-flex min-h-11 items-center text-caption text-text-muted transition-colors hover:text-text">
                Features
              </Link>
              <Link href="#how-it-works" className="inline-flex min-h-11 items-center text-caption text-text-muted transition-colors hover:text-text">
                How it works
              </Link>
              <Link href="/sign-up" className="inline-flex min-h-11 items-center text-caption text-text-muted transition-colors hover:text-text">
                Get started
              </Link>
            </div>
            <div className="flex flex-col">
              <h2 className="pb-1 text-caption font-medium text-text">Players</h2>
              <Link href="/book" className="inline-flex min-h-11 items-center text-caption text-text-muted transition-colors hover:text-text">
                Book a pitch
              </Link>
              <Link href="/booking/lookup" className="inline-flex min-h-11 items-center text-caption text-text-muted transition-colors hover:text-text">
                Find my booking
              </Link>
              <Link href="/rules" className="inline-flex min-h-11 items-center text-caption text-text-muted transition-colors hover:text-text">
                Rules
              </Link>
            </div>
          </nav>
        </div>

        <p className="mt-8 border-t border-border pt-6 text-caption text-text-muted">
          &copy; {YEAR} Turfly. Dhaka, Bangladesh.
        </p>
      </div>
    </footer>
  );
}
