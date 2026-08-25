/**
 * ROUTE: /booking-not-found — public, no login.
 *
 * Where an unresolvable `turfly.xyz/{slug}` link ends up. This is NOT the
 * same thing as app/not-found.tsx and deliberately does not reuse
 * next/navigation's notFound() to get here — see lib/request-venue.ts's
 * getRequestVenue() for why: a slug arrives at `/book` (or `/rules`, etc.)
 * via middleware.ts's rewrite, so the browser's address bar still shows the
 * ORIGINAL `/{slug}` path while the page actually rendered is `/book`'s.
 * Next's client router builds its route-tree expectations from that
 * original path, and calling notFound() from a page whose real path
 * differs from the perceived one hits a Next.js/Turbopack quirk where
 * hydration never recovers — confirmed by hand: a plain reload of an
 * unknown `/{slug}` left the page permanently blank in both `next dev` and
 * a production `next build && next start`, no visible error, no console
 * error, just a stuck streaming placeholder that never got revealed.
 *
 * redirect() sidesteps it entirely: it is a real navigation to a route
 * whose perceived and actual path are the same thing, so there is nothing
 * for the client router to reconcile.
 *
 * Deliberately uses the MARKETING header/footer, not components/site's —
 * those call getVenueSetting() -> getRequestVenueId() -> getRequestVenue(),
 * which is exactly the function that just failed to resolve a venue and
 * sent the visitor here. PATH_VENUE_COOKIE is still set to the bad slug
 * (nothing about a redirect() during a page render can clear it — Next only
 * allows cookie writes from a Server Action or Route Handler), so
 * components/site/header.tsx's SiteHeader would hit the exact same
 * unresolvable-venue branch and redirect right back here — an infinite
 * loop, confirmed by hand before this comment existed. Turfly's own brand
 * chrome has no venue to resolve, so it can't loop, and it is also the more
 * honest framing here: this is Turfly telling you it couldn't find a turf,
 * not some particular turf's own page.
 */
import Link from 'next/link';
import { MarketingHeader } from '@/components/marketing/marketing-header';
import { MarketingFooter } from '@/components/marketing/marketing-footer';
import { Button } from '@/components/ui/button';

export const metadata = {
  title: 'Turf not found',
  robots: { index: false, follow: false },
};

export default function BookingNotFoundPage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <MarketingHeader />
      <main className="mx-auto flex w-full max-w-[560px] flex-1 flex-col items-start justify-center px-4 py-16">
        <p className="text-caption font-medium text-text-muted">Not found</p>
        <h1 className="mt-2 text-display text-text">We couldn&apos;t find that turf</h1>
        <p className="mt-2 text-body text-text-muted">
          The link you followed doesn&apos;t match a turf on Turfly — double-check it, or ask
          whoever sent it to you for the right one.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Button asChild>
            <Link href="/">Turfly home</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/demo">See the live demo</Link>
          </Button>
        </div>
      </main>
      <MarketingFooter />
    </div>
  );
}
