import Link from 'next/link';
import { Geist } from 'next/font/google';
import { LogOut } from 'lucide-react';
import { auth, signOut } from '@/auth';
import { getVenueName } from '@/lib/venue';
import { SidebarNav } from '@/components/admin/sidebar-nav';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

/** Dashboard-only font (CLAUDE.md §11's design-system note) — the public
 * booking pages keep Inter; this is scoped to this layout's subtree via
 * `geist.variable` on the root wrapper below, which the [data-dashboard-
 * theme] block in globals.css reads as --font-geist. */
const geist = Geist({ variable: '--font-geist', subsets: ['latin'], display: 'swap' });

/** Initials for the avatar fallback - "Counter Staff" -> "CS", a single
 * name -> its first two letters. Never blank: session.user.name is
 * always set for an authenticated staff session. */
function initials(name: string | null | undefined): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

/** Signs the current staff session out, then sends them to /login. A
 * Server Action so the sign-out button works with plain HTML form
 * submission (no client JS required) - shared between the sidebar and
 * the mobile top bar rather than duplicated in each. */
async function signOutAction() {
  'use server';
  await signOut({ redirectTo: '/login' });
}

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const isAdmin = session?.user.role === 'ADMIN';
  const venueName = await getVenueName();

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
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-border bg-surface md:flex">
        <div className="flex items-center gap-2.5 px-5 py-5">
          <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-accent text-caption font-semibold text-white">
            {venueName.slice(0, 1).toUpperCase()}
          </div>
          <Link href="/admin" className="truncate text-subheading font-semibold tracking-tight text-text">
            {venueName}
          </Link>
        </div>
        <div className="flex-1 overflow-y-auto px-3 pb-3">
          <SidebarNav isAdmin={isAdmin} vertical />
        </div>
        <div className="border-t border-border p-3">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex w-full items-center gap-2.5 rounded-(--radius-input) p-2 text-left transition-colors hover:bg-surface-muted">
                <Avatar>
                  <AvatarFallback>{initials(session?.user.name)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-body font-medium text-text">{session?.user.name}</p>
                  <p className="truncate text-caption text-text-muted">{session?.user.role}</p>
                </div>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" side="top" className="w-56">
              <form action={signOutAction}>
                <DropdownMenuItem asChild variant="destructive">
                  <button type="submit" className="w-full">
                    <LogOut />
                    Sign out
                  </button>
                </DropdownMenuItem>
              </form>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile only (< md): the old top-bar + horizontal-scroll nav,
         * unchanged in behavior from before the sidebar existed. */}
        <header className="border-b border-border bg-surface md:hidden">
          <div className="flex h-14 items-center justify-between gap-3 px-4">
            <Link href="/admin" className="shrink-0 text-subheading font-semibold tracking-tight text-text">
              {venueName}
            </Link>
            <div className="flex items-center gap-3 text-caption text-text-muted">
              <span>{session?.user.role}</span>
              <form action={signOutAction}>
                <button type="submit" className="text-danger hover:underline">
                  Sign out
                </button>
              </form>
            </div>
          </div>
          <div className="overflow-x-auto px-4 pb-3">
            <SidebarNav isAdmin={isAdmin} vertical={false} />
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1180px] flex-1 px-4 py-8 md:px-8">{children}</main>
      </div>
    </div>
  );
}
