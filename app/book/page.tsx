import { redirect } from 'next/navigation';
import { formatDateParam } from '@/lib/format';
import { todayDate } from '@/lib/booking-window';
import { getRequestVenue } from '@/lib/request-venue';
import { getActiveFields, FieldPicker } from '@/components/booking/field-picker';
import { SiteHeader } from '@/components/site/header';
import { SiteFooter } from '@/components/site/footer';

export const dynamic = 'force-dynamic';

/**
 * ROUTE: /book — public, no login.
 *
 * A venue with exactly one active field (still nearly every venue) skips
 * straight to today's date, same as before the multi-field pass — zero
 * extra steps. A venue with more than one shows the field picker first;
 * /book/[date] is still the one real implementation of the day view either
 * way (CLAUDE.md §7 lists both routes).
 */
export default async function BookIndexPage() {
  const venue = await getRequestVenue();
  const fields = await getActiveFields(venue.id);
  const dateParam = formatDateParam(todayDate());

  if (fields.length <= 1) {
    redirect(`/book/${dateParam}`);
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-[1120px] flex-1 px-4 py-8">
        <h1 className="text-display text-text">Choose a field</h1>
        <p className="mt-1 text-body text-text-muted">{venue.name} has more than one — pick which to book.</p>
        <div className="mt-6">
          <FieldPicker fields={fields} dateParam={dateParam} />
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
