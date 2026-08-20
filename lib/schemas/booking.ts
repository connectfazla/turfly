/**
 * Zod schemas — CLAUDE.md §3/§4: "one schema shared by client form and
 * server action." Each schema here is imported by a React Hook Form on the
 * client (via zodResolver) AND by the matching app/actions/*.ts Server
 * Action, so validation can never drift between the two.
 */
import { z } from 'zod';

const DATE_PARAM_RE = /^\d{4}-\d{2}-\d{2}$/;
const BD_PHONE_RE = /^(?:\+?880|0)1[3-9]\d{8}$/;
const REFERENCE_RE = /^TRF-\d{4}-\d{4}$/;

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
  phone: phoneSchema,
  fullName: fullNameSchema,
});
export type HoldSlotFormInput = z.input<typeof holdSlotSchema>;
export type HoldSlotFormOutput = z.output<typeof holdSlotSchema>;

export const confirmBookingSchema = z.object({
  holdId: z.string().min(1, 'Missing hold'),
  date: dateParamSchema,
  slotIndex: slotIndexSchema,
  email: z.string().trim().email('Enter a valid email').optional().or(z.literal('')).transform((v) => (v ? v : undefined)),
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
    .regex(REFERENCE_RE, 'Enter a valid booking reference, e.g. TRF-2026-0001'),
  phone: phoneSchema,
});
export type LookupBookingFormInput = z.input<typeof lookupBookingSchema>;

export const publicCancelBookingSchema = z.object({
  reference: z
    .string()
    .trim()
    .toUpperCase()
    .regex(REFERENCE_RE, 'Enter a valid booking reference, e.g. TRF-2026-0001'),
  phone: phoneSchema,
  reason: optionalText(300),
});
export type PublicCancelBookingFormInput = z.input<typeof publicCancelBookingSchema>;
