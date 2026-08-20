import Link from 'next/link';
import { SiteHeader } from '@/components/site/header';
import { SiteFooter } from '@/components/site/footer';
import { Button } from '@/components/ui/button';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const venue = await prisma.venueSetting.findUnique({ where: { id: 'singleton' } });

  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="flex-1">
        <section className="mx-auto flex max-w-[1120px] flex-col items-start gap-4 px-4 py-16">
          <h1 className="text-display text-text">{venue?.venueName ?? 'Greenfield Turf'}</h1>
          <p className="max-w-[560px] text-body text-text-muted">
            One field, open 24 hours. Pick a date, pick a 90-minute slot, and get your booking
            reference in under 90 seconds — no account needed.
          </p>
          <Button asChild size="lg" className="mt-2">
            <Link href="/book">Book a slot</Link>
          </Button>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
