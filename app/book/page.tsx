import { redirect } from 'next/navigation';
import { formatDateParam } from '@/lib/format';
import { todayDate } from '@/lib/booking-window';

/**
 * ROUTE: /book — public, no login.
 *
 * Always resolves to today's date; /book/[date] is the one real
 * implementation (CLAUDE.md §7 lists both routes, this just redirects).
 */
export default function BookIndexPage() {
  redirect(`/book/${formatDateParam(todayDate())}`);
}
