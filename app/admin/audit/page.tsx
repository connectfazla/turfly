import { prisma } from '@/lib/prisma';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 100;

function diffSummary(before: unknown, after: unknown): string {
  if (before == null && after != null) return 'created';
  if (before != null && after == null) return 'deleted';
  if (before == null && after == null) return 'no detail';

  const b = before as Record<string, unknown>;
  const a = after as Record<string, unknown>;
  const keys = new Set([...Object.keys(b), ...Object.keys(a)]);
  const changed: string[] = [];
  for (const key of keys) {
    if (JSON.stringify(b[key]) !== JSON.stringify(a[key])) {
      changed.push(`${key}: ${JSON.stringify(b[key])} → ${JSON.stringify(a[key])}`);
    }
  }
  return changed.length > 0 ? changed.join(', ') : 'no field changes';
}

export default async function AdminAuditPage() {
  const entries = await prisma.auditLog.findMany({
    include: { actor: true },
    orderBy: { createdAt: 'desc' },
    take: PAGE_SIZE,
  });

  return (
    <div>
      <h1 className="text-display text-text">Audit log</h1>
      <p className="mt-1 text-body text-text-muted">Append-only. Every mutation, who made it, and what changed.</p>

      <div className="mt-6 overflow-x-auto rounded-(--radius-card) border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>When</TableHead>
              <TableHead>Actor</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Entity</TableHead>
              <TableHead>Diff</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-body text-text-muted">
                  No audit entries yet.
                </TableCell>
              </TableRow>
            ) : (
              entries.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="text-caption tabular-nums text-text-muted">
                    {e.createdAt.toLocaleString('en-GB')}
                  </TableCell>
                  <TableCell>{e.actor?.name ?? 'System'}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="rounded-(--radius-input) border-border text-text">
                      {e.action}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-caption text-text-muted">
                    {e.entityType} · {e.entityId.slice(0, 8)}
                  </TableCell>
                  <TableCell className="max-w-md truncate text-caption text-text-muted" title={diffSummary(e.before, e.after)}>
                    {diffSummary(e.before, e.after)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
