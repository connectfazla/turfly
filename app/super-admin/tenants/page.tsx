/** ROUTE: /super-admin/tenants — every business on the platform. */
import { prisma } from '@/lib/prisma';
import { requireSuperAdmin } from '@/lib/auth/require-super-admin';
import { formatDateLong } from '@/lib/format';
import { Badge } from '@/components/ui/badge';
import { VenueActiveToggle } from '@/components/super-admin/venue-active-toggle';

export const dynamic = 'force-dynamic';

export default async function TenantsPage() {
  await requireSuperAdmin();

  const tenants = await prisma.tenant.findMany({
    orderBy: { createdAt: 'asc' },
    include: {
      venues: {
        orderBy: { createdAt: 'asc' },
        select: { id: true, name: true, slug: true, isActive: true, _count: { select: { bookings: true } } },
      },
    },
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-display text-text">Businesses</h1>
        <p className="mt-1 text-body text-text-muted">
          Every tenant on the platform, and the venues under each.
        </p>
      </div>

      {tenants.length === 0 ? (
        <div className="rounded-(--radius-card) border border-border bg-surface px-4 py-12 text-center">
          <p className="text-body text-text">No businesses yet</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {tenants.map((t) => (
            <div key={t.id} className="rounded-(--radius-card) border border-border bg-surface">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-4">
                <div>
                  <h2 className="text-subheading text-text">{t.name}</h2>
                  <p className="text-caption text-text-muted">
                    {t.ownerEmail ?? 'no owner email'} · joined {formatDateLong(t.createdAt)}
                  </p>
                </div>
                {t.clerkOrgId ? null : (
                  // Tenant Zero predates onboarding and has no Clerk org. Worth
                  // showing rather than hiding: it explains why this one row
                  // behaves differently from every other business.
                  <Badge className="bg-surface-muted text-text-muted">legacy · no organization</Badge>
                )}
              </div>
              <div className="divide-y divide-border">
                {t.venues.map((v) => (
                  <div key={v.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                    <div className="min-w-0">
                      <div className="text-body text-text">{v.name}</div>
                      <div className="text-caption tabular-nums text-text-muted">
                        /{v.slug} · {v._count.bookings} booking{v._count.bookings === 1 ? '' : 's'}
                      </div>
                    </div>
                    <VenueActiveToggle venueId={v.id} isActive={v.isActive} />
                  </div>
                ))}
                {t.venues.length === 0 ? (
                  <p className="px-5 py-3 text-caption text-text-muted">No venues yet.</p>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
