/**
 * Presentation helpers — money and date formatting for Asia/Dhaka (CLAUDE.md
 * §2: "All timestamps stored UTC. Rendered in Asia/Dhaka. Currency BDT.").
 *
 * lib/slots.ts intentionally does its slot arithmetic with plain local-time
 * Date methods, relying on the server process's TZ=Asia/Dhaka env var
 * (CLAUDE.md §8). This file is the display layer: it formats explicitly
 * against Asia/Dhaka via date-fns-tz regardless of the process TZ, so
 * rendering stays correct even if that assumption ever drifts.
 */
import { formatInTimeZone } from 'date-fns-tz';

export const APP_TIMEZONE = 'Asia/Dhaka';

const currencyFormatter = new Intl.NumberFormat('en-BD', {
  style: 'currency',
  currency: 'BDT',
  maximumFractionDigits: 0,
});

/** Formats a price as "BDT 1,800". Accepts a string too because Prisma's
 * Decimal fields serialize to strings (e.g. booking.priceAmount.toString()). */
export function formatBDT(amount: number | string): string {
  const n = typeof amount === 'string' ? Number(amount) : amount;
  return currencyFormatter.format(n);
}

/** "Thu, 20 Aug" — used on the date strip. */
export function formatDateShort(date: Date): string {
  return formatInTimeZone(date, APP_TIMEZONE, 'EEE, d MMM');
}

/** "Thursday, 20 August 2026" — used on confirm/success pages. */
export function formatDateLong(date: Date): string {
  return formatInTimeZone(date, APP_TIMEZONE, 'EEEE, d MMMM yyyy');
}

/** "2026-08-20" — the /book/[date] URL param shape. */
export function formatDateParam(date: Date): string {
  return formatInTimeZone(date, APP_TIMEZONE, 'yyyy-MM-dd');
}

const DATE_PARAM_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Parses a /book/[date] URL param into a calendar-day Date at local
 * midnight (matching how lib/slots.ts constructs dates). Returns null for
 * anything malformed — callers should 404 rather than guess. */
export function parseDateParam(param: string): Date | null {
  const match = DATE_PARAM_RE.exec(param);
  if (!match) return null;
  const [, y, m, d] = match as unknown as [string, string, string, string];
  const year = Number(y);
  const month = Number(m);
  const day = Number(d);
  const date = new Date(year, month - 1, day);
  // Reject overflow dates like 2026-02-31, which JS Date would silently
  // roll into March.
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }
  return date;
}

/** "TRF-2026-0184" -> true. Used to validate the lookup form before hitting
 * the database. */
export function isValidReferenceFormat(reference: string): boolean {
  return /^TRF-\d{4}-\d{4}$/.test(reference);
}

/** Plain-language status for customer-facing screens (e.g.
 * /booking/lookup) — a raw enum value like PENDING_VERIFICATION reads as
 * a bug to someone who isn't staff. Falls back to the raw value for any
 * status this hasn't been taught yet, so a new enum member never renders
 * blank. */
export function formatBookingStatus(status: string): string {
  switch (status) {
    case 'HELD':
      return 'Reserved (not yet paid)';
    case 'PENDING_VERIFICATION':
      return 'Awaiting payment verification';
    case 'CONFIRMED':
      return 'Confirmed';
    case 'COMPLETED':
      return 'Completed';
    case 'CANCELLED':
      return 'Cancelled';
    case 'EXPIRED':
      return 'Expired';
    case 'NO_SHOW':
      return 'No-show';
    default:
      return status;
  }
}
