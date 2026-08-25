/**
 * Zod schemas — CLAUDE.md §3/§4: "one schema shared by client form and
 * server action." Each schema here is imported by a React Hook Form on the
 * client (via zodResolver) AND by the matching app/actions/*.ts Server
 * Action, so validation can never drift between the two.
 */
import { z } from 'zod';

const DATE_PARAM_RE = /^\d{4}-\d{2}-\d{2}$/;
const BD_PHONE_RE = /^(?:\+?880|0)1[3-9]\d{8}$/;
/** Accepts BOTH reference shapes:
 *   TRF-2026-0001          legacy, pre-multi-tenant
 *   TRF-TFLY-2026-0001     current, venue-scoped
 * The legacy form must keep matching forever — Venue Zero's existing
 * bookings carry it, and a customer looking one up years later should not
 * be told their own reference is invalid. Narrowing this to the new form
 * only would break /booking/lookup for every booking made before today. */
const REFERENCE_RE = /^TRF-(?:[A-Z0-9]{2,8}-)?\d{4}-\d{4}$/;
/** bKash TRXN IDs are 10 uppercase-alphanumeric characters in practice
 * (e.g. "8N7A1B2C3D"), but bKash doesn't publish a formal spec and the
 * format has drifted before — validated loosely (6-20 chars) rather than
 * to an exact length so a legitimate TRXN is never rejected by a regex
 * that's stricter than reality. Staff do the real check by hand against
 * their bKash statement; this only guards against empty/garbage input. */
const BKASH_TRXN_RE = /^[A-Z0-9]{6,20}$/;

/** "01712345678" / "+8801712345678" / "8801712345678" -> "+8801712345678".
 * Keeps one Customer row per person regardless of how they typed it. */
export function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.startsWith('880') && digits.length === 13) return `+${digits}`;
  if (digits.startsWith('0') && digits.length === 11) return `+880${digits.slice(1)}`;
  return `+${digits}`;
}

export const phoneSchema = z
  .string()
  .trim()
  .regex(BD_PHONE_RE, 'Enter a valid Bangladeshi mobile number, e.g. 01712345678')
  .transform(normalizePhone);

export const fullNameSchema = z
  .string()
  .trim()
  .min(2, 'Enter your full name')
  .max(100, 'Name is too long');

export const dateParamSchema = z.string().regex(DATE_PARAM_RE, 'Invalid date');
export const slotIndexSchema = z.number().int().min(0).max(15);

/** Optional text field submitted via a plain HTML form — "" and undefined
 * both mean "not provided". Exported for reuse by lib/schemas/admin.ts. */
export function optionalText(max: number) {
  return z
    .string()
    .trim()
    .max(max)
    .optional()
    .or(z.literal(''))
    .transform((v) => (v ? v : undefined));
}

// ---------------------------------------------------------------- public forms

export const holdSlotSchema = z.object({
  date: dateParamSchema,
  slotIndex: slotIndexSchema,
  /** Which of the venue's fields — multi-field pass. Always sent by the
   * client: components/booking/field-picker.tsx resolves it even for a
   * single-field venue (no picker shown), so the server never has to
   * guess. */
  fieldId: z.string().min(1, 'Missing field'),
  phone: phoneSchema,
  fullName: fullNameSchema,
});
export type HoldSlotFormInput = z.input<typeof holdSlotSchema>;
export type HoldSlotFormOutput = z.output<typeof holdSlotSchema>;

/** Full name and phone are already required at hold time (holdSlotSchema).
 * Email, address and the bKash advance TRXN are required HERE, at confirm
 * time — moving a HELD row to PENDING_VERIFICATION without all three
 * means the customer record and payment claim are unusable to staff. */
export const confirmBookingSchema = z.object({
  holdId: z.string().min(1, 'Missing hold'),
  date: dateParamSchema,
  slotIndex: slotIndexSchema,
  email: z.string().trim().min(1, 'Enter your email').email('Enter a valid email'),
  address: z.string().trim().min(5, 'Enter your address').max(300, 'Address is too long'),
  trxId: z
    .string()
    .trim()
    .toUpperCase()
    .min(1, 'Enter the bKash transaction ID')
    .regex(BKASH_TRXN_RE, 'Enter a valid bKash transaction ID, e.g. 8N7A1B2C3D'),
  teamName: optionalText(80),
  note: optionalText(300),
});
export type ConfirmBookingFormInput = z.input<typeof confirmBookingSchema>;
export type ConfirmBookingFormOutput = z.output<typeof confirmBookingSchema>;

export const lookupBookingSchema = z.object({
  reference: z
    .string()
    .trim()
    .toUpperCase()
    .regex(REFERENCE_RE, 'Enter a valid booking reference, e.g. TRF-TFLY-2026-0001'),
  phone: phoneSchema,
});
export type LookupBookingFormInput = z.input<typeof lookupBookingSchema>;

export const publicCancelBookingSchema = z.object({
  reference: z
    .string()
    .trim()
    .toUpperCase()
    .regex(REFERENCE_RE, 'Enter a valid booking reference, e.g. TRF-TFLY-2026-0001'),
  phone: phoneSchema,
  reason: optionalText(300),
});
export type PublicCancelBookingFormInput = z.input<typeof publicCancelBookingSchema>;
