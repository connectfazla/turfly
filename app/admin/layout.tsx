import Link from 'next/link';
import { Geist } from 'next/font/google';
import { LogOut } from 'lucide-react';
import { getVenueName } from '@/lib/venue';
import { requireRole } from '@/lib/auth/require-role';
import { signOutAction } from '@/app/actions/auth';
import { SidebarNav } from '@/components/admin/sidebar-nav';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';

/** Dashboard-only font (CLAUDE.md §11's design-system note) — the public
 * booking pages keep Inter; this is scoped to this layout's subtree via
 * `geist.variable` on the root wrapper below, which the [data-dashboard-
 * theme] block in globals.css reads as --font-geist. */
const geist = Geist({ variable: '--font-geist', subsets: ['latin'], display: 'swap' });

/** Initials for the avatar fallback - "Counter Staff" -> "CS", a single
 * name -> its first two letters. Never blank: User.name is required, and
 * requireRole() throws rather than returning an anonymous staff member. */
function initials(name: string | null | undefined): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

/** OWNER/MANAGER/BOOKIE are the internal vocabulary; staff read plain
 * words. Kept here rather than in require-role.ts so the auth layer has no
 * opinion about presentation. */
function roleLabel(role: 'OWNER' | 'MANAGER' | 'BOOKIE'): string {
  return { OWNER: 'Owner', MANAGER: 'Manager', BOOKIE: 'Bookie' }[role];
}

/** Shown to a signed-in person who simply isn't staff here. This is a
 * routine outcome, not an error: anyone with an account can reach /admin by
 * typing it. A stack trace would be both alarming and useless to them, so
 * this is a plain dead end with a way back. */
function NoAccess() {
  return (
    <div className="bg-surface flex min-h-dvh flex-col items-center justify-center gap-4 px-4 text-center">
      <div>
        <h1 className="text-heading text-text">Staff access only</h1>
        <p className="text-body text-text-muted mt-1 max-w-sm">
          You&apos;re signed in, but this account isn&apos;t staff at this venue. If that seems
          wrong, ask the venue owner to invite you.
        </p>
      </div>
      <Link
        href="/"
        className="bg-accent text-body hover:bg-accent/90 rounded-(--radius-input) px-4 py-2 text-white transition-colors"
      >
        Back to booking
      </Link>
    </div>
  );
}

/** Sign-out as a Server Action form, so it works without client JS and needs
 * no session state in the browser. */
function SignOutButton() {
  return (
    <form action={signOutAction}>
      <button
        type="submit"
        className="text-text-muted hover:bg-surface-muted hover:text-danger flex size-8 items-center justify-center rounded-full transition-colors"
        aria-label="Sign out"
        title="Sign out"
      >
        <LogOut className="size-4" aria-hidden="true" />
      </button>
    </form>
  );
}

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // Not just for display: middleware only proves someone is signed in, so
  // this is the gate that proves they are staff at this venue at all. Each
  // page and action beneath still re-checks - CLAUDE.md §7.
  let staff: Awaited<ReturnType<typeof requireRole>>;
  try {
    staff = await requireRole();
  } catch {
    // Fails closed: anything requireRole refuses - not signed in, no
    // grant, deactivated, venue inactive - lands here rather than
    // rendering a single child page.
    return <NoAccess />;
  }
  // staff.venueId, NOT the request host. The dashboard is reached at
  // turfly.app/admin regardless of which venue you work at, so resolving the
  // name from the host would show every staff member "Turfly" (Venue Zero)
  // instead of their own turf.
  const venueName = await getVenueName(staff.venueId);

  return (
    <div data-dashboard-theme className={`flex min-h-dvh ${geist.variable}`}>
      {/* Desktop/tablet: a fixed left sidebar - the primary layout, since
       * staff running this from the counter are on a tablet or desktop,
       * not a phone. Below md, this is replaced entirely by the top bar
       * + horizontal nav further down, not squeezed into a drawer -
       * simpler, and admin usage on a phone is the rare case here.
       * sticky + h-dvh: pinned to the viewport regardless of how tall
       * <main>'s content is (a full day-timeline can be taller than one
       * screen) - only <main> scrolls, matching how every real dashboard
       * shell behaves; without this the footer (sign-out) drifted off
       * the bottom of the screen on any page taller than the viewport. */}
      <aside className="border-border bg-surface sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r md:flex">
        <div className="flex items-center gap-2.5 px-5 py-5">
          <div className="bg-accent text-caption flex size-7 shrink-0 items-center justify-center rounded-lg font-semibold text-white">
            {venueName.slice(0, 1).toUpperCase()}
          </div>
          <Link
            href="/admin"
            className="text-subheading text-text truncate font-semibold tracking-tight"
          >
            {venueName}
          </Link>
        </div>
        <div className="flex-1 overflow-y-auto px-3 pb-3">
          <SidebarNav role={staff.role} vertical />
        </div>
        {/* The name/role block is not decoration: counter machines get
         * shared, and "who am I signed in as" is the thing staff need to
         * check before they take money on somebody else's account. */}
        <div className="border-border flex items-center gap-2.5 border-t p-3">
          <Avatar>
            <AvatarFallback>{initials(staff.name)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="text-body text-text truncate font-medium">{staff.name}</p>
            <p className="text-caption text-text-muted truncate">{roleLabel(staff.role)}</p>
          </div>
          <SignOutButton />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile only (< md): the old top-bar + horizontal-scroll nav,
         * unchanged in behavior from before the sidebar existed. */}
        <header className="border-border bg-surface border-b md:hidden">
          <div className="flex h-14 items-center justify-between gap-3 px-4">
            <Link
              href="/admin"
              className="text-subheading text-text shrink-0 font-semibold tracking-tight"
            >
              {venueName}
            </Link>
            <div className="text-caption text-text-muted flex items-center gap-3">
              <span>{roleLabel(staff.role)}</span>
              <SignOutButton />
            </div>
          </div>
          <div className="overflow-x-auto px-4 pb-3">
            <SidebarNav role={staff.role} vertical={false} />
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1180px] flex-1 px-4 py-8 md:px-8">{children}</main>
      </div>
    </div>
  );
}
