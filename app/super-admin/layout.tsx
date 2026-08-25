/**
 * Platform-operator surface. Deliberately visually distinct from /admin —
 * this is the one place where actions cross tenant boundaries, and it should
 * never be mistaken for an ordinary venue dashboard.
 */
import Link from 'next/link';
import { Geist } from 'next/font/google';
import { UserButton } from '@clerk/nextjs';
import { requireSuperAdmin } from '@/lib/auth/require-super-admin';

const geist = Geist({ variable: '--font-geist', subsets: ['latin'], display: 'swap' });

function NoAccess() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-surface px-4 text-center">
      <div>
        <h1 className="text-heading text-text">Not available</h1>
        <p className="mt-1 max-w-sm text-body text-text-muted">
          This area is for platform operators.
        </p>
      </div>
      <Link
        href="/"
        className="rounded-(--radius-input) bg-accent px-4 py-2 text-body text-white transition-colors hover:bg-accent/90"
      >
        Back to booking
      </Link>
    </div>
  );
}

export default async function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  // Gates rendering only. Every page and action beneath calls
  // requireSuperAdmin() itself — a layout does not protect a Server Action.
  try {
    await requireSuperAdmin();
  } catch {
    return <NoAccess />;
  }

  return (
    <div data-dashboard-theme className={`min-h-dvh bg-surface ${geist.variable}`}>
      <header className="border-b border-border bg-surface-muted">
        <div className="mx-auto flex h-14 max-w-[1180px] items-center justify-between gap-4 px-4 md:px-8">
          <div className="flex items-center gap-5">
            <Link href="/super-admin" className="text-subheading font-semibold tracking-tight text-text">
              Turfly <span className="text-text-muted">platform</span>
            </Link>
            <nav className="flex items-center gap-4 text-caption">
              <Link href="/super-admin/codes" className="text-text-muted hover:text-text">
                Codes
              </Link>
              <Link href="/super-admin/tenants" className="text-text-muted hover:text-text">
                Businesses
              </Link>
              <Link href="/admin" className="text-text-muted hover:text-text">
                My venue
              </Link>
            </nav>
          </div>
          <UserButton />
        </div>
      </header>
      <main className="mx-auto w-full max-w-[1180px] px-4 py-8 md:px-8">{children}</main>
    </div>
  );
}
