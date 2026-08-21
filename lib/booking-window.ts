/**
 * The public booking window — BOOKING_WINDOW_DAYS days starting today
 * (CLAUDE.md §8 env vars). Shared by /book, /book/[date] and DateStrip so
 * "which dates can be viewed/booked" is decided in exactly one place.
 */
const BOOKING_WINDOW_DAYS = Number(process.env.BOOKING_WINDOW_DAYS ?? 14);

/** Local-midnight of the given date, same calendar day. This module's own
 * copy, separate from lib/availability-service.ts's dateOnly() — that one
 * builds UTC-midnight for the Prisma boundary; this one only ever compares
 * against other local-midnight Dates within this file, so it doesn't need
 * the UTC conversion. */
function dateOnly(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** "Today", floored to local midnight. */
export function todayDate(now: Date = new Date()): Date {
  return dateOnly(now);
}

/** The BOOKING_WINDOW_DAYS dates in the window, starting today, in order. */
export function bookingWindowDates(now: Date = new Date()): Date[] {
  const today = todayDate(now);
  return Array.from({ length: BOOKING_WINDOW_DAYS }, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    return d;
  });
}

/** True for any date from today through today + (BOOKING_WINDOW_DAYS - 1),
 * inclusive. Used to reject stale or too-far-future /book/[date] links. */
export function isWithinBookingWindow(date: Date, now: Date = new Date()): boolean {
  const today = todayDate(now);
  const diffDays = Math.round((dateOnly(date).getTime() - today.getTime()) / 86_400_000);
  return diffDays >= 0 && diffDays < BOOKING_WINDOW_DAYS;
}

/** Pulls an out-of-window date back to the nearest boundary — used when a
 * /book/[date] link is stale (e.g. bookmarked from a previous day). */
export function clampToBookingWindow(date: Date, now: Date = new Date()): Date {
  const window = bookingWindowDates(now);
  const today = window[0]!;
  const last = window[window.length - 1]!;
  if (date.getTime() < today.getTime()) return today;
  if (date.getTime() > last.getTime()) return last;
  return date;
}
