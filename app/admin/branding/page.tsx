/**
 * ROUTE: /admin/branding — OWNER-only (same reasoning as /admin/pricing and
 * /admin/staff: business identity, not a Manager/Bookie decision).
 *
 * Two things live here: the venue's logo (app/actions/venue-branding.ts,
 * shown on the public booking page's header — components/site/header.tsx),
 * and the venue's own public booking-page URL, which previously had no
 * on-screen home anywhere in the admin panel at all.
 */
import { prisma } from '@/lib/prisma';
import { requireRoleForPage } from '@/lib/auth/require-role-for-page';
import { ROOT_DOMAIN } from '@/lib/request-venue';
import { venuePathUrl } from '@/lib/subdomain';
import { LogoUploadForm } from '@/components/admin/logo-upload-form';
import { RemoveLogoButton } from '@/components/admin/remove-logo-button';
import { BookingLink } from '@/components/admin/booking-link';

export const dynamic = 'force-dynamic';

export default async function AdminBrandingPage() {
  const staff = await requireRoleForPage('OWNER');
  const venue = await prisma.venue.findUniqueOrThrow({
    where: { id: staff.venueId },
    select: { name: true, slug: true, logoUrl: true },
  });

  const publicUrl = venuePathUrl(venue.slug, ROOT_DOMAIN);

  return (
    <div className="flex flex-col gap-10">
      <div>
        <h1 className="text-display text-text">Branding</h1>
        <p className="mt-1 max-w-[60ch] text-body text-text-muted">
          What customers see when they reach your booking page — your logo, and the link itself.
        </p>
      </div>

      <div>
        <h2 className="text-heading text-text">Your booking page</h2>
        <p className="mt-1 max-w-[60ch] text-body text-text-muted">
          Share this link directly, or put it in a Facebook post or bio — anyone who opens it lands straight on
          your venue&apos;s live booking calendar.
        </p>
        <div className="mt-4 flex items-center gap-3 rounded-(--radius-card) border border-border bg-surface p-4">
          <BookingLink url={publicUrl} className="text-body font-medium text-text hover:text-accent" />
        </div>
      </div>

      <div className="border-t border-border pt-8">
        <h2 className="text-heading text-text">Logo</h2>
        <p className="mt-1 max-w-[60ch] text-body text-text-muted">
          Shown next to your venue name at the top of your booking page. Leave it unset and customers see your
          name alone — that&apos;s a normal, finished-looking state, not a placeholder.
        </p>
        <div className="mt-6 flex flex-col gap-4">
          <LogoUploadForm currentLogoUrl={venue.logoUrl} />
          {venue.logoUrl ? <RemoveLogoButton /> : null}
        </div>
      </div>
    </div>
  );
}
