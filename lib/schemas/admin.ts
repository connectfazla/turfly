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

export const counterBookingSchema = z.object({
  date: dateParamSchema,
  slotIndex: slotIndexSchema,
  phone: phoneSchema,
  fullName: fullNameSchema,
  email: z.string().trim().email('Enter a valid email').optional().or(z.literal('')).transform((v) => (v ? v : undefined)),
  teamName: optionalText(80),
  note: optionalText(300),
  priceOverride: z
    .union([z.number(), z.nan()])
    .optional()
    .transform((v) => (v === undefined || Number.isNaN(v) ? undefined : v)),
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

export const pricingSchema = z.object({
  standard: z.coerce.number().positive('Enter a price greater than zero'),
  peak: z.coerce.number().positive('Enter a price greater than zero'),
  weekendStandard: z.coerce.number().positive('Enter a price greater than zero'),
  weekendPeak: z.coerce.number().positive('Enter a price greater than zero'),
});
export type PricingFormInput = z.input<typeof pricingSchema>;

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
