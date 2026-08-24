/**
 * ROUTE: any unmatched path, plus every explicit notFound() call
 * elsewhere in the app (e.g. /book/success/[ref], /admin/bookings/[id])
 * — public, renders regardless of auth state.
 *
 * Without this file Next.js falls back to its own generic "This page
 * could not be found" page, unstyled and off-brand — not something a
 * customer mid-booking should ever land on.
 */
import Link from 'next/link';
import { SiteHeader } from '@/components/site/header';
import { SiteFooter } from '@/components/site/footer';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-[560px] flex-1 flex-col items-start justify-center px-4 py-16">
        <p className="text-caption font-medium text-text-muted">404</p>
        <h1 className="mt-2 text-display text-text">Page not found</h1>
        <p className="mt-2 text-body text-text-muted">
          That page doesn&apos;t exist, or the link has expired — a booking reference page, for
          example, only works right after a booking is made.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Button asChild>
            <Link href="/book">Book a slot</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/booking/lookup">Find a booking</Link>
          </Button>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
