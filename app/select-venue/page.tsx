/**
 * ROUTE: /select-venue — reached when a staff member has access to more
 * than one venue and nothing (a form payload, the turfly_venue cookie, the
 * single-venue fallback) says which one /admin means. See
 * lib/auth/active-venue.ts's VenueNotSelectedError and
 * app/admin/layout.tsx's redirect here.
 *
 * Deliberately OUTSIDE app/admin/ — that layout is exactly what throws
 * VenueNotSelectedError, so a page nested under it would never get to
 * render for the person who needs to see this one.
 */
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import { accessibleVenueIds } from '@/lib/auth/active-venue';
import { prisma } from '@/lib/prisma';
import { selectVenueAction } from '@/app/actions/venue-selection';
import { AuthShell } from '@/components/auth/auth-shell';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Choose a venue', robots: { index: false, follow: false } };

export default async function SelectVenuePage() {
  const session = await getSessionUser();
  if (!session) redirect('/sign-in?next=/select-venue');

  const venueIds = await accessibleVenueIds(session.user);

  // Every ordinary path to VenueNotSelectedError already implies >= 2
  // venues (lib/auth/active-venue.ts's resolveActiveVenueId returns the
  // sole venue directly when there's exactly one, and throws Forbidden, not
  // VenueNotSelected, at zero). But this URL is typeable directly, so both
  // edges are handled rather than assumed away.
  if (venueIds.length === 0) {
    return (
      <AuthShell
        title="No venues yet"
        subtitle="This account isn't staff at any venue. If that seems wrong, ask the venue owner to invite you."
      >
        <Link
          href="/"
          className="block rounded-(--radius-input) bg-accent px-4 py-2 text-center text-body text-white transition-colors hover:bg-accent/90"
        >
          Back to booking
        </Link>
      </AuthShell>
    );
  }
  if (venueIds.length === 1) redirect('/admin');

  const venues = await prisma.venue.findMany({
    where: { id: { in: venueIds } },
    select: { id: true, name: true, tenant: { select: { name: true } } },
    orderBy: { name: 'asc' },
  });

  return (
    <AuthShell title="Choose a venue" subtitle="This account has access to more than one venue.">
      <div className="flex flex-col gap-2">
        {venues.map((venue) => (
          <form key={venue.id} action={selectVenueAction.bind(null, venue.id)}>
            <button
              type="submit"
              className="flex w-full items-center justify-between gap-3 rounded-(--radius-input) border border-border bg-surface px-4 py-3 text-left transition-colors hover:bg-surface-muted hover:border-accent/40"
            >
              <span className="min-w-0">
                <span className="block truncate text-body font-medium text-text">{venue.name}</span>
                <span className="block truncate text-caption text-text-muted">{venue.tenant.name}</span>
              </span>
              <span aria-hidden="true" className="shrink-0 text-text-muted">
                →
              </span>
            </button>
          </form>
        ))}
      </div>
    </AuthShell>
  );
}
