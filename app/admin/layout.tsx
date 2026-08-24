import Link from 'next/link';
import { auth, signOut } from '@/auth';
import { getVenueName } from '@/lib/venue';
import { SidebarNav } from '@/components/admin/sidebar-nav';

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
    <div className="flex min-h-dvh">
      {/* Desktop/tablet: a fixed left sidebar - the primary layout, since
       * staff running this from the counter are on a tablet or desktop,
       * not a phone. Below md, this is replaced entirely by the top bar
       * + horizontal nav further down, not squeezed into a drawer -
       * simpler, and admin usage on a phone is the rare case here. */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-surface md:flex">
        <div className="border-b border-border px-4 py-5">
          <Link href="/admin" className="text-subheading font-semibold text-text">
            {venueName}
          </Link>
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          <SidebarNav isAdmin={isAdmin} vertical />
        </div>
        <div className="border-t border-border p-4">
          <p className="text-body text-text">{session?.user.name}</p>
          <p className="text-caption text-text-muted">{session?.user.role}</p>
          <form action={signOutAction}>
            <button type="submit" className="mt-2 text-caption text-danger hover:underline">
              Sign out
            </button>
          </form>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile only (< md): the old top-bar + horizontal-scroll nav,
         * unchanged in behavior from before the sidebar existed. */}
        <header className="border-b border-border bg-surface md:hidden">
          <div className="flex h-14 items-center justify-between gap-3 px-4">
            <Link href="/admin" className="shrink-0 text-subheading font-semibold text-text">
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

        <main className="mx-auto w-full max-w-[1120px] flex-1 px-4 py-8">{children}</main>
      </div>
    </div>
  );
}
