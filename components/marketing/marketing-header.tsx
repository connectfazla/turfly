import Link from 'next/link';
import { Show, SignInButton, UserButton } from '@clerk/nextjs';

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
    <header className="sticky top-0 z-20 border-b border-border bg-surface/85 backdrop-blur-sm">
      <div className="mx-auto flex h-16 max-w-[1120px] items-center justify-between gap-4 px-4">
        <Link href="/" className="flex min-h-11 items-center gap-2" aria-label="Turfly home">
          <span
            aria-hidden="true"
            className="flex size-7 items-center justify-center rounded-lg bg-accent text-caption font-semibold text-white"
          >
            T
          </span>
          <span className="text-subheading font-semibold tracking-tight text-text">Turfly</span>
        </Link>

        {/* min-h-11 (44px) on every control: the labels are only 16px tall,
          * so without it the hit areas fall under the 44pt minimum on touch.
          * Applied as min-height rather than padding so the bar keeps its
          * 64px height and the links stay optically centred. */}
        <nav aria-label="Main" className="flex items-center gap-1 text-caption sm:gap-2 sm:text-body">
          <Link
            href="#how-it-works"
            className="hidden min-h-11 items-center px-3 text-text-muted transition-colors hover:text-text sm:inline-flex"
          >
            How it works
          </Link>
          <Link
            href="#features"
            className="hidden min-h-11 items-center px-3 text-text-muted transition-colors hover:text-text sm:inline-flex"
          >
            Features
          </Link>
          {/* <Show>, not <SignedIn>/<SignedOut>: those were removed in
            * @clerk/nextjs Core 3 and throw at build time. <Show> resolves
            * the session on the server, so this page renders per-request
            * rather than statically. Fine for SEO — crawlers still get
            * complete HTML — it just costs a little TTFB versus a fully
            * static page. */}
          <Show when="signed-out">
            <SignInButton mode="modal">
              <button className="inline-flex min-h-11 cursor-pointer items-center px-3 text-text-muted transition-colors hover:text-text">
                Sign in
              </button>
            </SignInButton>
            <Link
              href="/sign-up"
              className="inline-flex min-h-11 items-center rounded-full bg-accent px-4 text-white transition-colors hover:bg-accent/90"
            >
              Get started
            </Link>
          </Show>
          <Show when="signed-in">
            <Link
              href="/admin"
              className="inline-flex min-h-11 items-center px-3 text-text-muted transition-colors hover:text-text"
            >
              Dashboard
            </Link>
            <UserButton />
          </Show>
        </nav>
      </div>
    </header>
  );
}
