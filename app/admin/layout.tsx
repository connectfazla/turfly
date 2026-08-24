import Link from 'next/link';
import { auth, signOut } from '@/auth';
import { getVenueName } from '@/lib/venue';

const NAV_LINKS = [
  { href: '/admin', label: 'Dashboard' },
  { href: '/admin/calendar', label: 'Calendar' },
  { href: '/admin/bookings', label: 'Bookings' },
  { href: '/admin/blackouts', label: 'Blackouts' },
  { href: '/admin/customers', label: 'Customers' },
] as const;

const ADMIN_ONLY_NAV_LINKS = [
  { href: '/admin/pricing', label: 'Pricing' },
  { href: '/admin/reports', label: 'Reports' },
  { href: '/admin/users', label: 'Users' },
  { href: '/admin/audit', label: 'Audit' },
] as const;

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const isAdmin = session?.user.role === 'ADMIN';
  const venueName = await getVenueName();

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex h-16 max-w-[1120px] items-center justify-between gap-3 px-4">
          <Link href="/admin" className="shrink-0 text-subheading font-semibold text-text">
            {venueName}: Admin
          </Link>
          <div className="flex items-center gap-4 text-caption text-text-muted">
            <span>
              {session?.user.name} · {session?.user.role}
            </span>
            <form
              action={async () => {
                'use server';
                await signOut({ redirectTo: '/login' });
              }}
            >
              <button type="submit" className="text-danger hover:underline">
                Sign out
              </button>
            </form>
          </div>
        </div>
        <nav className="mx-auto flex max-w-[1120px] gap-4 overflow-x-auto px-4 pb-3 text-caption text-text-muted">
          {NAV_LINKS.map((link) => (
            <Link key={link.href} href={link.href} className="shrink-0 hover:text-text">
              {link.label}
            </Link>
          ))}
          {isAdmin
            ? ADMIN_ONLY_NAV_LINKS.map((link) => (
                <Link key={link.href} href={link.href} className="shrink-0 hover:text-text">
                  {link.label}
                </Link>
              ))
            : null}
        </nav>
      </header>
      <main className="mx-auto w-full max-w-[1120px] flex-1 px-4 py-8">{children}</main>
    </div>
  );
}
