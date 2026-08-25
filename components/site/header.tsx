import Link from 'next/link';
import Image from 'next/image';
import { getVenueSetting, DEFAULT_VENUE_NAME } from '@/lib/venue';

/** The venue name is read from the database (a Venue row, not hard-coded
 * — see lib/venue.ts), so this same codebase can be redeployed for a
 * different venue owner without a code change - see app/page.tsx, which
 * already did this; the rest of the site's chrome (this header, the
 * footer, the admin nav, the login page) previously didn't, which meant
 * the brand name only actually changed on the homepage. The logo is the
 * same idea one step further: an owner-uploaded image (Venue.logoUrl,
 * app/actions/venue-branding.ts) when set, nothing extra when it isn't —
 * name-only is a normal finished state, not a placeholder waiting to be
 * filled in. */
export async function SiteHeader() {
  const venue = await getVenueSetting();
  const venueName = venue?.name ?? DEFAULT_VENUE_NAME;

  return (
    <header className="border-border bg-surface border-b">
      <div className="mx-auto flex h-16 max-w-[1120px] items-center justify-between gap-3 px-4">
        <Link href="/" className="flex shrink-0 items-center gap-2">
          {venue?.logoUrl ? (
            // alt="" — the venue name right next to it already names the
            // link; a screen reader announcing the image again would be
            // redundant, not extra information.
            <Image src={venue.logoUrl} alt="" width={32} height={32} className="size-8 rounded-md object-contain" />
          ) : null}
          <span className="text-subheading text-text sm:text-heading font-semibold">{venueName}</span>
        </Link>
        <nav className="text-caption text-text-muted sm:text-body flex items-center gap-3 sm:gap-6">
          <Link href="/book" className="hover:text-text">
            Book
          </Link>
          <Link href="/booking/lookup" className="hover:text-text">
            My booking
          </Link>
          <Link href="/rules" className="hover:text-text">
            Rules
          </Link>
        </nav>
      </div>
    </header>
  );
}
