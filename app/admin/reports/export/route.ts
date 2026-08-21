import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/require-role';
import { parseDateParam } from '@/lib/format';
import { slotLabel, type SlotIndex } from '@/lib/slots';
import { buildReport } from '@/lib/reports';

export const dynamic = 'force-dynamic';

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

/** CSV export for any date range — BUILD_PLAN.md step 7. ADMIN-only, same
 * as the rest of /admin/reports. */
export async function GET(request: NextRequest) {
  try {
    await requireRole('ADMIN');
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
