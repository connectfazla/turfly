/** ROUTE: /super-admin/codes — issue and revoke registration codes. */
import { prisma } from '@/lib/prisma';
import { requireSuperAdmin } from '@/lib/auth/require-super-admin';
import { formatDateLong } from '@/lib/format';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { IssueCodeForm } from '@/components/super-admin/issue-code-form';
import { RevokeCodeButton } from '@/components/super-admin/revoke-code-button';

export const dynamic = 'force-dynamic';

type CodeRow = {
  revokedAt: Date | null;
  tenantId: string | null;
  redeemedAt: Date | null;
  expiresAt: Date | null;
};

/** The four states a code can be in, in precedence order. Completed beats
 * revoked because a business that exists cannot be un-created. */
function codeStatus(c: CodeRow, now: Date): { label: string; tone: 'accent' | 'muted' | 'warning' | 'danger' } {
  if (c.tenantId) return { label: 'Used', tone: 'accent' };
  if (c.revokedAt) return { label: 'Revoked', tone: 'danger' };
  if (c.redeemedAt) return { label: 'Signing up', tone: 'warning' };
  if (c.expiresAt && c.expiresAt <= now) return { label: 'Expired', tone: 'muted' };
  return { label: 'Unused', tone: 'muted' };
}

export default async function CodesPage() {
  await requireSuperAdmin();
  const now = new Date();

  const codes = await prisma.registrationCode.findMany({
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  // One query for every tenant a code produced, rather than a per-row lookup.
  const tenantIds = codes.map((c) => c.tenantId).filter((id): id is string => id !== null);
  const tenants = tenantIds.length
    ? await prisma.tenant.findMany({ where: { id: { in: tenantIds } }, select: { id: true, name: true } })
    : [];
  const tenantName = new Map(tenants.map((t) => [t.id, t.name]));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-display text-text">Registration codes</h1>
        <p className="mt-1 text-body text-text-muted">
          Nobody can register a turf business without one of these.
        </p>
      </div>

      <IssueCodeForm />

      {codes.length === 0 ? (
        <div className="rounded-(--radius-card) border border-border bg-surface px-4 py-12 text-center">
          <p className="text-body text-text">No codes yet</p>
          <p className="mt-1 text-caption text-text-muted">
            Issue one above, then send it to the turf owner who is signing up.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-(--radius-card) border border-border bg-surface">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>For</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Issued</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {codes.map((c) => {
                const status = codeStatus(c, now);
                const canRevoke = !c.tenantId && !c.revokedAt;
                return (
                  <TableRow key={c.code}>
                    <TableCell className="font-mono tabular-nums">{c.display}</TableCell>
                    <TableCell>
                      <div className="text-body text-text">{c.label ?? '—'}</div>
                      {c.issuedToEmail ? (
                        <div className="text-caption text-text-muted">{c.issuedToEmail}</div>
                      ) : null}
                      {c.tenantId ? (
                        <div className="text-caption text-accent">
                          → {tenantName.get(c.tenantId) ?? 'business created'}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <Badge
                        className={
                          status.tone === 'accent'
                            ? 'bg-accent-soft text-accent'
                            : status.tone === 'danger'
                              ? 'bg-surface-muted text-danger'
                              : status.tone === 'warning'
                                ? 'bg-surface-muted text-warning'
                                : 'bg-surface-muted text-text-muted'
                        }
                      >
                        {status.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-caption text-text-muted">{formatDateLong(c.createdAt)}</TableCell>
                    <TableCell className="text-caption text-text-muted">
                      {c.expiresAt ? formatDateLong(c.expiresAt) : 'Never'}
                    </TableCell>
                    <TableCell className="text-right">
                      {canRevoke ? <RevokeCodeButton code={c.code} /> : null}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
