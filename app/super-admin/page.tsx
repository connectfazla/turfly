/** ROUTE: /super-admin — platform overview. */
import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { requireSuperAdmin } from '@/lib/auth/require-super-admin';
import { StatCard } from '@/components/admin/stat-card';

export const dynamic = 'force-dynamic';

export default async function SuperAdminPage() {
  await requireSuperAdmin();

  const [tenants, venues, unusedCodes, bookings] = await Promise.all([
    prisma.tenant.count(),
    prisma.venue.count({ where: { isActive: true } }),
    prisma.registrationCode.count({ where: { redeemedAt: null, revokedAt: null } }),
    prisma.booking.count(),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-display text-text">Platform</h1>
        <p className="mt-1 text-body text-text-muted">Every business on Turfly, across all tenants.</p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Businesses" value={String(tenants)} />
        <StatCard label="Active venues" value={String(venues)} />
        <StatCard label="Unused codes" value={String(unusedCodes)} />
        <StatCard label="Bookings, all time" value={String(bookings)} />
      </div>

      <div className="flex gap-3">
        <Link
          href="/super-admin/codes"
          className="rounded-(--radius-input) bg-accent px-4 py-2 text-body text-white transition-colors hover:bg-accent/90"
        >
          Issue a registration code
        </Link>
        <Link
          href="/super-admin/tenants"
          className="rounded-(--radius-input) border border-border px-4 py-2 text-body text-text transition-colors hover:bg-surface-muted"
        >
          View businesses
        </Link>
      </div>
    </div>
  );
}
