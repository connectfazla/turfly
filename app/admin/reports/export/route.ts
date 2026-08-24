/**
 * ROUTE: GET /admin/reports/export?from=&to= — ADMIN-only.
 *
 * A route handler rather than a Server Action because the browser needs
 * to download a file, not receive a JSON result (CLAUDE.md §4 restricts
 * "hand-written POST route handlers" to booking operations; this is a
 * plain GET download, which is exactly what route handlers are for).
 * Reuses lib/reports.ts's buildReport() so the CSV always matches what
 * the /admin/reports page itself shows for the same range.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/require-role';
import { parseDateParam } from '@/lib/format';
import { slotLabel, type SlotIndex } from '@/lib/slots';
import { buildReport } from '@/lib/reports';

export const dynamic = 'force-dynamic';

/** Quotes a CSV field only when it contains a character that would
 * otherwise break column alignment (comma, quote, or newline). */
function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

/** CSV export for any date range — BUILD_PLAN.md step 7. ADMIN-only, same
 * as the rest of /admin/reports. */
export async function GET(request: NextRequest) {
  try {
    await requireRole('OWNER', 'MANAGER');
  } catch {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 });
  }

  const params = request.nextUrl.searchParams;
  const from = parseDateParam(params.get('from') ?? '') ?? new Date(new Date().setDate(1));
  const to = parseDateParam(params.get('to') ?? '') ?? new Date();

  const report = await buildReport(from, to, 'day');

  const header = ['Reference', 'Date', 'Time', 'Status', 'Customer', 'Phone', 'Price', 'Paid'];
  const lines = [header.join(',')];
  for (const row of report.rows) {
    lines.push(
      [
        row.reference,
        row.date.toISOString().slice(0, 10),
        slotLabel(row.slotIndex as SlotIndex),
        row.status,
        csvEscape(row.customerName),
        row.phone,
        row.priceAmount.toFixed(2),
        row.amountPaid.toFixed(2),
      ].join(','),
    );
  }

  const csv = lines.join('\n');
  const filename = `bookings-${report.from.toISOString().slice(0, 10)}-to-${report.to.toISOString().slice(0, 10)}.csv`;

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
