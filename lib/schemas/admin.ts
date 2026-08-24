/**
 * Zod schemas for staff/admin Server Actions — CLAUDE.md §4: one schema
 * shared by client form and server action.
 */
import { z } from 'zod';
import {
  dateParamSchema,
  fullNameSchema,
  optionalText,
  phoneSchema,
  slotIndexSchema,
} from './booking';

const PAYMENT_METHODS = ['CASH', 'BKASH', 'NAGAD', 'BANK_TRANSFER', 'CARD', 'OTHER'] as const;
const idSchema = z.string().min(1);

// ---------------------------------------------------------------- counter booking

/** CASH or BKASH only here — staff taking a counter booking are recording
 * money they already have in hand or a TRXN they can see on their own
 * phone right now, not the full PaymentMethod list (NAGAD/BANK_TRANSFER/
 * CARD/OTHER stay available from the general RecordPaymentForm instead). */
const COUNTER_PAYMENT_METHODS = ['CASH', 'BKASH'] as const;

export const counterBookingSchema = z.object({
  date: dateParamSchema,
  slotIndex: slotIndexSchema,
  phone: phoneSchema,
  fullName: fullNameSchema,
  email: z.string().trim().email('Enter a valid email').optional().or(z.literal('')).transform((v) => (v ? v : undefined)),
  address: optionalText(300),
  teamName: optionalText(80),
  note: optionalText(300),
  priceOverride: z
    .union([z.number(), z.nan()])
    .optional()
    .transform((v) => (v === undefined || Number.isNaN(v) ? undefined : v)),
  /** How the walk-in customer is paying, chosen by staff right on this
   * form — CLAUDE.md's "admin can choose cash or online" requirement.
   * Defaults to CASH so the field never blocks a booking staff want to
   * create before any money has changed hands. */
  paymentMethod: z.enum(COUNTER_PAYMENT_METHODS).default('CASH'),
  /** Optional — if staff already collected money at the counter, entering
   * it here records a Payment row in the same action as the booking
   * itself instead of a separate trip to the booking detail page. */
  amountReceived: z
    .union([z.number(), z.nan()])
    .optional()
    .transform((v) => (v === undefined || Number.isNaN(v) || v <= 0 ? undefined : v)),
});
export type CounterBookingFormInput = z.input<typeof counterBookingSchema>;

// ---------------------------------------------------------------- booking mutations

export const checkInSchema = z.object({ bookingId: idSchema });
export const markNoShowSchema = z.object({ bookingId: idSchema });

export const cancelStaffSchema = z.object({
  bookingId: idSchema,
  reason: optionalText(300),
});

export const rescheduleStaffSchema = z.object({
  bookingId: idSchema,
  newDate: dateParamSchema,
  newSlotIndex: slotIndexSchema,
});

export const recordPaymentSchema = z.object({
  bookingId: idSchema,
  amount: z.coerce.number().positive('Enter an amount greater than zero'),
  method: z.enum(PAYMENT_METHODS),
  note: optionalText(200),
});
export type RecordPaymentFormInput = z.input<typeof recordPaymentSchema>;

// ---------------------------------------------------------------- payment verification

export const verifyPaymentSchema = z.object({ bookingId: idSchema });

export const rejectPaymentSchema = z.object({
  bookingId: idSchema,
  reason: z.string().trim().min(3, 'Enter a reason').max(300),
});
export type RejectPaymentFormInput = z.input<typeof rejectPaymentSchema>;

export const updateNoteSchema = z.object({
  bookingId: idSchema,
  internalNote: z.string().trim().max(1000),
});

// ---------------------------------------------------------------- blackouts

export const createBlackoutSchema = z.object({
  date: dateParamSchema,
  // "" from the <select> "whole day" option means null (closes all 16).
  slotIndex: z
    .union([slotIndexSchema, z.literal('')])
    .transform((v) => (v === '' ? null : v)),
  reason: z.string().trim().min(3, 'Enter a reason').max(200),
});
export type CreateBlackoutFormInput = z.input<typeof createBlackoutSchema>;

export const deleteBlackoutSchema = z.object({ id: idSchema });

// ---------------------------------------------------------------- customers

// ---------------------------------------------------------------- pricing

/** Noon is one flat price every day (lowest-demand window); afternoon and
 * night (evening peak) each split by weekday/weekend. See lib/pricing.ts
 * for the slot-index tier boundaries these five prices bulk-apply to. */
export const pricingSchema = z.object({
  noon: z.coerce.number().positive('Enter a price greater than zero'),
  afternoon: z.coerce.number().positive('Enter a price greater than zero'),
  weekendAfternoon: z.coerce.number().positive('Enter a price greater than zero'),
  night: z.coerce.number().positive('Enter a price greater than zero'),
  weekendNight: z.coerce.number().positive('Enter a price greater than zero'),
});
export type PricingFormInput = z.input<typeof pricingSchema>;

// ---------------------------------------------------------------- payment settings

export const paymentSettingsSchema = z.object({
  bkashNumber: z
    .string()
    .trim()
    .regex(/^(?:\+?880|0)1[3-9]\d{8}$/, 'Enter a valid Bangladeshi mobile number, e.g. 01712345678'),
  depositPercent: z.coerce.number().int().min(1).max(100, 'Enter a percentage between 1 and 100'),
  paymentVerificationHours: z.coerce.number().int().min(1).max(168, 'Must be 168 hours (1 week) or less'),
});
export type PaymentSettingsFormInput = z.input<typeof paymentSettingsSchema>;

// ---------------------------------------------------------------- users

export const createUserSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email'),
  name: fullNameSchema,
  password: z.string().min(8, 'Password must be at least 8 characters'),
  role: z.enum(['ADMIN', 'MODERATOR']),
});
export type CreateUserFormInput = z.input<typeof createUserSchema>;

export const setUserActiveSchema = z.object({
  userId: idSchema,
  isActive: z.boolean(),
});

export const changeUserRoleSchema = z.object({
  userId: idSchema,
  role: z.enum(['ADMIN', 'MODERATOR']),
});

// ---------------------------------------------------------------- customers

export const blockCustomerSchema = z.object({
  customerId: idSchema,
  reason: z.string().trim().min(3, 'Enter a reason').max(200),
});
export const unblockCustomerSchema = z.object({ customerId: idSchema });
