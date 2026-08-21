import Link from 'next/link';
import Image from 'next/image';
import { SiteHeader } from '@/components/site/header';
import { SiteFooter } from '@/components/site/footer';
import { Button } from '@/components/ui/button';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * Plain functional value props, not a features list — the hero above
 * carries the pitch, this is just the three facts a first-time visitor
 * needs before they click through. No cards: a divided row keeps the
 * page's minimal system intact (CLAUDE.md §6 doesn't allow a new card
 * chrome just for this).
 */
const VALUE_PROPS = [
  { label: 'No account needed', detail: 'Book with just your name and phone number.' },
  { label: 'Free cancellation', detail: 'Up to 6 hours before your slot starts.' },
  { label: 'Open 24 hours', detail: 'Every day, including the late-night slots.' },
];

export default async function HomePage() {
  const venue = await prisma.venueSetting.findUnique({ where: { id: 'singleton' } });

  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="flex-1">
        {/* Asymmetric split hero: copy left, photography right. A centred
         * hero over a background image was the obvious move here and is
         * exactly what CLAUDE.md's own "state is never colour-only" and
         * WCAG-contrast rules make risky (text on a photo needs a scrim
         * that this design system has no token for) — a two-column split
         * keeps every line of text on a plain surface background instead. */}
        <section className="mx-auto max-w-[1120px] px-4 pt-10 pb-16 sm:pt-14">
          <div className="grid items-center gap-10 lg:grid-cols-[1fr_1.1fr] lg:gap-14">
            <div className="flex flex-col gap-6">
              <h1 className="text-display text-text">Book the pitch in minutes.</h1>
              <p className="max-w-[46ch] text-body text-text-muted">
                {venue?.venueName ?? 'Greenfield Turf'}: pick a date, pick a 90-minute slot, and
                get your booking reference in under 90 seconds. No account needed.
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <Button asChild size="lg">
                  <Link href="/book">Book a slot</Link>
                </Button>
                <Button asChild size="lg" variant="outline">
                  <Link href="/rules">See the rules</Link>
                </Button>
              </div>
            </div>

            <div className="relative aspect-[4/3] w-full overflow-hidden rounded-(--radius-card) border border-border sm:aspect-[16/10] lg:aspect-[4/3]">
              <Image
                src="/images/hero-pitch.jpg"
                alt="An empty synthetic turf pitch at dusk, a football resting on the grass in soft focus"
                fill
                priority
                sizes="(min-width: 1024px) 620px, 100vw"
                className="object-cover"
              />
            </div>
          </div>
        </section>

        {/* Value props sit below the hero, never inside it (hero is copy +
         * one CTA pair only). A divided row, not three identical cards. */}
        <section className="border-t border-border bg-surface-muted">
          <div className="mx-auto grid max-w-[1120px] gap-8 divide-y divide-border px-4 py-10 sm:grid-cols-3 sm:gap-10 sm:divide-x sm:divide-y-0">
            {VALUE_PROPS.map((item) => (
              <div key={item.label} className="flex flex-col gap-1 pt-6 first:pt-0 sm:pt-0 sm:pl-8 sm:first:pl-0">
                <span className="text-subheading text-text">{item.label}</span>
                <span className="text-caption text-text-muted">{item.detail}</span>
              </div>
            ))}
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
