import Link from 'next/link';

/**
 * The marketing site's own header — deliberately NOT components/site/header.tsx.
 *
 * That one is a venue's header: it links to Book, My booking, Rules, and reads
 * its brand from the Venue row, which is right for a turf's own booking pages.
 * The root domain sells the software to turf owners, so it needs different
 * links and a fixed "Turfly" wordmark. Sharing one header would have forced
 * every venue's booking page to carry product-marketing navigation.
 */
export function MarketingHeader() {
  return (
    <header className="border-border bg-surface/85 sticky top-0 z-20 border-b backdrop-blur-sm">
      <div className="mx-auto flex h-16 max-w-[1120px] items-center justify-between gap-4 px-4">
        <Link href="/" className="flex min-h-11 items-center gap-2" aria-label="Turfly home">
          <span
            aria-hidden="true"
            className="bg-accent text-caption flex size-7 items-center justify-center rounded-lg font-semibold text-white"
          >
            T
          </span>
          <span className="text-subheading text-text font-semibold tracking-tight">Turfly</span>
        </Link>

        {/* min-h-11 (44px) on every control: the labels are only 16px tall,
         * so without it the hit areas fall under the 44pt minimum on touch.
         * Applied as min-height rather than padding so the bar keeps its
         * 64px height and the links stay optically centred. */}
        <nav
          aria-label="Main"
          className="text-caption sm:text-body flex items-center gap-1 sm:gap-2"
        >
          <Link
            href="#how-it-works"
            className="text-text-muted hover:text-text hidden min-h-11 items-center px-3 transition-colors sm:inline-flex"
          >
            How it works
          </Link>
          <Link
            href="#features"
            className="text-text-muted hover:text-text hidden min-h-11 items-center px-3 transition-colors sm:inline-flex"
          >
            Features
          </Link>

          <Link
            href="/sign-in"
            className="text-text-muted hover:text-text inline-flex min-h-11 items-center px-3 transition-colors"
          >
            Sign in
          </Link>
          <Link
            href="/sign-up"
            className="bg-accent hover:bg-accent/90 inline-flex min-h-11 items-center rounded-full px-4 text-white transition-colors"
          >
            Get started
          </Link>
        </nav>
      </div>
    </header>
  );
}
