import { getVenueName } from '@/lib/venue';

/** Same reasoning as SiteHeader: venue name comes from the database, not
 * a hard-coded string, so the brand is one admin-editable row rather
 * than something baked into every page's markup. */
export async function SiteFooter() {
  const venueName = await getVenueName();

  return (
    <footer className="border-t border-border bg-surface">
      <div className="mx-auto max-w-[1120px] px-4 py-8 text-caption text-text-muted">
        {venueName}. One field, open 24 hours. Bookings close 6 hours before kickoff for online
        cancellation.
      </div>
    </footer>
  );
}
