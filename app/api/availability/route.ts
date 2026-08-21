import { NextRequest, NextResponse } from 'next/server';
import { fetchDayAvailability } from '@/lib/availability-service';
import { prisma } from '@/lib/prisma';
import { parseDateParam } from '@/lib/format';

export const dynamic = 'force-dynamic';

/**
 * ROUTE: GET /api/availability?date= — public, no login.
 *
 * The JSON API mentioned in CLAUDE.md §4, polled by the public SlotGrid
 * every 30s (BUILD_PLAN.md step 4) so the grid stays fresh without a full
 * page reload. Uses the exact same fetchDayAvailability() as the Server
 * Component first paint and the admin panel - there is no second
 * availability implementation anywhere in the app.
 */
export async function GET(request: NextRequest) {
  const dateParam = request.nextUrl.searchParams.get('date');
  if (!dateParam) {
    return NextResponse.json({ error: 'Missing required "date" query param (yyyy-MM-dd).' }, { status: 400 });
  }

  const date = parseDateParam(dateParam);
  if (!date) {
    return NextResponse.json({ error: 'Invalid date.' }, { status: 400 });
  }

  const { slots } = await fetchDayAvailability(prisma, date, new Date());
  return NextResponse.json({ date: dateParam, slots });
}
