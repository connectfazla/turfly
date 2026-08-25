import { NextRequest, NextResponse } from 'next/server';
import { fetchDayAvailability } from '@/lib/availability-service';
import { prisma } from '@/lib/prisma';
import { parseDateParam } from '@/lib/format';
import { getRequestVenueId } from '@/lib/request-venue';

export const dynamic = 'force-dynamic';

/**
 * ROUTE: GET /api/availability?date=&field= — public, no login.
 *
 * The JSON API mentioned in CLAUDE.md §4, polled by the public SlotGrid
 * every 30s (BUILD_PLAN.md step 4) so the grid stays fresh without a full
 * page reload. Uses the exact same fetchDayAvailability() as the Server
 * Component first paint and the admin panel - there is no second
 * availability implementation anywhere in the app.
 *
 * `field` is optional (falls back to the venue's default field, same as
 * fetchDayAvailability's own fallback) so an existing bookmark/open tab on
 * a single-field venue keeps working with no query param at all.
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

  // Resolved from the request host, same as every other public booking
  // route — without this every venue's live poll silently read Venue
  // Zero's calendar regardless of which subdomain the visitor was on.
  const venueId = await getRequestVenueId();
  const fieldId = request.nextUrl.searchParams.get('field') ?? undefined;

  const { slots } = await fetchDayAvailability(prisma, date, new Date(), undefined, venueId, fieldId);
  return NextResponse.json({ date: dateParam, slots });
}
