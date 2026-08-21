/**
 * The booking engine — the correctness core described in CLAUDE.md §4 and
 * BUILD_PLAN.md step 3. Unlike lib/slots.ts and lib/availability.ts, THIS
 * file talks to the database on purpose: it is the only place allowed to.
 *
 * Every write here happens inside a Serializable transaction, in this
 * order:
 *   1. sweep expired holds (frees the partial unique index)
 *   2. assert bookability via getDayAvailability — the ONE availability fn
 *   3. domain checks (blocked customer, per-phone limit, hold ownership)
 *   4. the write itself
 *   5. an AuditLog row, in the same transaction
 *
 * Notifications are NOT sent from here — CLAUDE.md §4: "Notifications are a
 * side effect outside the booking transaction." Callers (Server Actions)
 * send them after a successful call returns.
 */
import { Prisma, type Booking, type BookingSource, type PaymentMethod } from '@prisma/client';
import { prisma } from './prisma';
import { dateOnly, fetchDayAvailability } from './availability-service';
import { assertValidSlotIndex, hasSlotStarted, slotEnd, slotStart, type SlotIndex, type SlotView } from './slots';

type Tx = Prisma.TransactionClient;

// ---------------------------------------------------------------- errors

export class BookingEngineError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

/** Thrown when the slot is no longer AVAILABLE — taken by someone else,
 * maintenance, blacked out, or in the past. Always safe to show verbatim. */
export class SlotTakenError extends BookingEngineError {
  constructor(message = 'That slot was just booked by someone else.') {
    super(message, 'SLOT_TAKEN');
  }
}

export class SlotNotBookableError extends BookingEngineError {
  constructor(message: string) {
    super(message, 'SLOT_NOT_BOOKABLE');
  }
}

export class CustomerBlockedError extends BookingEngineError {
  constructor(message = 'This phone number is currently blocked from booking. Please contact the venue.') {
    super(message, 'CUSTOMER_BLOCKED');
  }
}

export class BookingLimitExceededError extends BookingEngineError {
  constructor(message = 'You already have 2 active bookings. Cancel one before booking another.') {
    super(message, 'BOOKING_LIMIT_EXCEEDED');
  }
}

export class HoldExpiredError extends BookingEngineError {
  constructor(message = 'Your hold on this slot has expired. Please pick a slot again.') {
    super(message, 'HOLD_EXPIRED');
  }
}

export class InvalidTransitionError extends BookingEngineError {
  constructor(message: string) {
    super(message, 'INVALID_TRANSITION');
  }
}

export class CancellationWindowError extends BookingEngineError {
  constructor(
    message = 'This booking can only be cancelled online more than 6 hours before its start time. Please contact the venue.',
  ) {
    super(message, 'CANCELLATION_WINDOW_CLOSED');
  }
}

export class NotAuthorizedError extends BookingEngineError {
  constructor(message = 'You are not authorized to modify this booking.') {
    super(message, 'NOT_AUTHORIZED');
  }
}

// ---------------------------------------------------------------- config

const HOLD_MINUTES = Number(process.env.HOLD_MINUTES ?? 10);
const CANCELLATION_WINDOW_HOURS = Number(process.env.CANCELLATION_WINDOW_HOURS ?? 6);

/** Prisma error codes we special-case. See CLAUDE.md §10. */
const PRISMA_UNIQUE_VIOLATION = 'P2002';
const PRISMA_WRITE_CONFLICT = 'P2034'; // serialization failure or deadlock, under Serializable isolation

/** Type-narrows a caught error to Prisma's own error class and checks its
 * error code (e.g. 'P2002' for a unique-constraint violation). */
function isPrismaKnownError(err: unknown, code: string): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError && err.code === code
  );
}

/**
 * Runs `fn` inside a Serializable transaction. Retries exactly once on a
 * write-conflict (P2034) before surfacing SlotTakenError — CLAUDE.md §10:
 * "Serialisable transactions can abort under contention. Retry once before
 * surfacing an error." A P2002 (the partial unique index) is never
 * retried — the slot really is taken.
 */
async function runSerializable<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await prisma.$transaction(fn, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (err) {
      if (isPrismaKnownError(err, PRISMA_UNIQUE_VIOLATION)) {
        throw new SlotTakenError();
      }
      if (isPrismaKnownError(err, PRISMA_WRITE_CONFLICT) && attempt === 0) {
        continue; // retry once
      }
      if (isPrismaKnownError(err, PRISMA_WRITE_CONFLICT)) {
        // Retried once and still conflicting — from the caller's point of
        // view this means the same thing: someone else won the slot.
        throw new SlotTakenError();
      }
      throw err;
    }
  }
  /* istanbul ignore next -- unreachable, loop always returns or throws */
  throw new SlotTakenError();
}

// ---------------------------------------------------------------- shared helpers

/**
 * Maps a non-AVAILABLE slot to the right error for the caller. SlotTakenError
 * ("just booked by someone else") is reserved for BOOKED — an actual race
 * with another booking. Every other reason (past, maintenance, blocked) is
 * known before the transaction even starts and gets its own honest message
 * instead of implying a race that didn't happen.
 */
function assertSlotBookable(slot: SlotView): void {
  switch (slot.state) {
    case 'AVAILABLE':
      return;
    case 'BOOKED':
      throw new SlotTakenError();
    case 'PAST':
      throw new SlotNotBookableError('This slot has already started.');
    case 'MAINTENANCE':
      throw new SlotNotBookableError('This slot is closed for maintenance.');
    case 'BLOCKED':
      throw new SlotNotBookableError('This slot is not available.');
  }
}

/** Frees expired holds so they stop occupying the partial unique index.
 * Must run inside the same transaction as the write that follows it. */
async function sweepExpiredHolds(tx: Tx, now: Date): Promise<void> {
  await tx.booking.updateMany({
    where: { status: 'HELD', holdExpiresAt: { lt: now } },
    data: { status: 'EXPIRED' },
  });
}

/** Finds-or-creates the Customer for this phone number, refreshing name/
 * email/team on every call (a returning customer's details stay current
 * without a separate "edit profile" flow - they just don't overwrite an
 * existing email/team with nothing when those fields are left blank).
 * Throws CustomerBlockedError before touching anything else if staff have
 * blocked this phone number. */
async function upsertCustomer(
  tx: Tx,
  input: { phone: string; fullName: string; email?: string | null; teamName?: string | null },
) {
  const existing = await tx.customer.findUnique({ where: { phone: input.phone } });
  if (existing?.isBlocked) {
    throw new CustomerBlockedError();
  }
  if (!existing) {
    return tx.customer.create({
      data: {
        phone: input.phone,
        fullName: input.fullName,
        email: input.email ?? null,
        teamName: input.teamName ?? null,
      },
    });
  }
  return tx.customer.update({
    where: { id: existing.id },
    data: {
      fullName: input.fullName,
      email: input.email ?? existing.email,
      teamName: input.teamName ?? existing.teamName,
    },
  });
}

/** Reference format TRF-YYYY-NNNN, sequential per calendar year, generated
 * inside the transaction (CLAUDE.md §8). Keyed by the year the booking was
 * MADE, not the year of the slot, so it behaves like an invoice sequence. */
async function nextReference(tx: Tx, now: Date): Promise<string> {
  const year = now.getFullYear();
  const prefix = `TRF-${year}-`;
  const count = await tx.booking.count({ where: { reference: { startsWith: prefix } } });
  return `${prefix}${String(count + 1).padStart(4, '0')}`;
}

/** CLAUDE.md §2 invariant 6: max 2 active future bookings per phone
 * number via the public page (staff/COUNTER bookings skip this check
 * entirely - see createFreshConfirmedBooking). "Active future" = CONFIRMED
 * and not yet started; fetched then filtered in JS rather than in SQL so
 * the exact-slot-start comparison stays on the same TZ-safe footing as
 * the rest of the app (see lib/availability-service.ts's dateOnly doc). */
async function countActiveBookings(tx: Tx, customerId: string, now: Date): Promise<number> {
  const today = dateOnly(now);
  const candidates = await tx.booking.findMany({
    where: { customerId, status: 'CONFIRMED', date: { gte: today } },
    select: { date: true, slotIndex: true },
  });
  return candidates.filter((b) => !hasSlotStarted(b.date, b.slotIndex as SlotIndex, now)).length;
}

/** Every mutation in this file ends with a call to this, inside the same
 * transaction as the mutation itself - CLAUDE.md §9's "audit row written
 * for any mutation" is enforced structurally here, not by remembering to
 * call it from every Server Action separately. */
async function writeAudit(
  tx: Tx,
  params: {
    actorId?: string | null;
    action: string;
    entityId: string;
    before?: unknown;
    after?: unknown;
  },
) {
  await tx.auditLog.create({
    data: {
      actorId: params.actorId ?? null,
      action: params.action,
      entityType: 'Booking',
      entityId: params.entityId,
      before: params.before === undefined ? Prisma.JsonNull : (params.before as Prisma.InputJsonValue),
      after: params.after === undefined ? Prisma.JsonNull : (params.after as Prisma.InputJsonValue),
    },
  });
}

// ---------------------------------------------------------------- holdSlot

export interface HoldSlotInput {
  date: Date;
  slotIndex: number;
  phone: string;
  fullName: string;
  now?: Date;
}

/** — → HELD. Public: reserves a slot for HOLD_MINUTES while the visitor
 * finishes the confirm form. Generates the reference now, since Booking.reference
 * is required at every status. */
export async function holdSlot(input: HoldSlotInput): Promise<Booking> {
  assertValidSlotIndex(input.slotIndex);
  const now = input.now ?? new Date();
  const slotIndex = input.slotIndex as SlotIndex;

  return runSerializable(async (tx) => {
    await sweepExpiredHolds(tx, now);

    const { day, ruleByIndex, slots } = await fetchDayAvailability(tx, input.date, now);
    const slot = slots.find((s) => s.index === slotIndex)!;
    assertSlotBookable(slot);

    const customer = await upsertCustomer(tx, { phone: input.phone, fullName: input.fullName });
    const reference = await nextReference(tx, now);
    const holdExpiresAt = new Date(now.getTime() + HOLD_MINUTES * 60_000);
    const price = ruleByIndex.get(slotIndex)!.price;

    const booking = await tx.booking.create({
      data: {
        reference,
        customerId: customer.id,
        date: day,
        slotIndex,
        status: 'HELD',
        holdExpiresAt,
        priceAmount: price,
        source: 'ONLINE',
      },
    });

    await writeAudit(tx, { action: 'BOOKING_HELD', entityId: booking.id, after: booking });
    return booking;
  });
}

// ---------------------------------------------------------------- createBooking

interface CreateBookingCommon {
  date: Date;
  slotIndex: number;
  email?: string;
  teamName?: string;
  note?: string;
  now?: Date;
}

export interface ConfirmHeldBookingInput extends CreateBookingCommon {
  /** The id of a booking previously returned by holdSlot(), for this same
   * (date, slotIndex). That HELD row is confirmed in place — its customer
   * (fixed at hold time) and reference (already generated) are reused, not
   * re-derived from anything in this call. */
  holdId: string;
}

export interface CreateFreshBookingInput extends CreateBookingCommon {
  holdId?: undefined;
  phone: string;
  fullName: string;
  /** Counter bookings (staff, source COUNTER) skip the 2-active-booking
   * limit and may set a custom price. */
  source?: BookingSource;
  createdById?: string;
  priceOverride?: number;
}

export type CreateBookingInput = ConfirmHeldBookingInput | CreateFreshBookingInput;

/** Discriminates the two CreateBookingInput shapes by whether holdId was
 * given. A dedicated type guard rather than an inline `if` because TS
 * does not preserve `if (input.holdId)` narrowing of an outer-scope
 * parameter across the nested transaction closure below - see the
 * comment at each call site. */
function isConfirmHeldInput(input: CreateBookingInput): input is ConfirmHeldBookingInput {
  return typeof input.holdId === 'string';
}

/**
 * HELD -> CONFIRMED (public, via holdId) or — -> CONFIRMED (counter
 * booking, staff, no holdId). Either way: sweep expired holds, assert
 * bookability, upsert the Customer by phone, enforce the 2-active-booking
 * limit (skipped for COUNTER), generate the reference (fresh-insert path
 * only — a held row already has one), create/confirm the row, write audit.
 */
export async function createBooking(input: CreateBookingInput): Promise<Booking> {
  assertValidSlotIndex(input.slotIndex);
  const now = input.now ?? new Date();
  const slotIndex = input.slotIndex as SlotIndex;

  if (isConfirmHeldInput(input)) {
    const confirmInput = input;
    return runSerializable(async (tx) => {
      await sweepExpiredHolds(tx, now);
      return confirmHeldBooking(tx, confirmInput, now, slotIndex);
    });
  }

  const freshInput = input;
  return runSerializable(async (tx) => {
    await sweepExpiredHolds(tx, now);
    return createFreshConfirmedBooking(tx, freshInput, now, slotIndex, freshInput.source ?? 'ONLINE');
  });
}

/** The holdId branch of createBooking: turns an existing HELD row into
 * CONFIRMED. Validates the hold still belongs to this exact (date,
 * slotIndex) and hasn't expired before touching anything. */
async function confirmHeldBooking(
  tx: Tx,
  input: ConfirmHeldBookingInput,
  now: Date,
  slotIndex: SlotIndex,
): Promise<Booking> {
  const day = dateOnly(input.date);
  const held = await tx.booking.findUnique({ where: { id: input.holdId } });

  if (!held || held.status !== 'HELD') {
    throw new HoldExpiredError();
  }
  if (held.date.getTime() !== day.getTime() || held.slotIndex !== slotIndex) {
    throw new InvalidTransitionError('This hold does not match the requested slot.');
  }
  if (!held.holdExpiresAt || held.holdExpiresAt.getTime() <= now.getTime()) {
    throw new HoldExpiredError();
  }

  const before = held;
  // The customer is fixed at hold time (held.customerId) — email/teamName
  // may still be filled in here, but never by re-resolving on a phone
  // number, which could silently attach these details to a DIFFERENT
  // customer if the confirm form ever carried a different phone.
  const customer = await tx.customer.findUniqueOrThrow({ where: { id: held.customerId } });
  await tx.customer.update({
    where: { id: customer.id },
    data: {
      email: input.email ?? customer.email,
      teamName: input.teamName ?? customer.teamName,
      totalBookings: { increment: 1 },
    },
  });

  const booking = await tx.booking.update({
    where: { id: held.id },
    data: {
      status: 'CONFIRMED',
      holdExpiresAt: null,
      customerNote: input.note ?? held.customerNote,
    },
  });

  await writeAudit(tx, { action: 'BOOKING_CONFIRMED', entityId: booking.id, before, after: booking });
  return booking;
}

/** The no-holdId branch of createBooking: inserts a brand new CONFIRMED
 * row directly. This is the path the concurrency test exercises (20 of
 * these racing for the same slot), since it's the one that actually hits
 * the partial unique index on INSERT. */
async function createFreshConfirmedBooking(
  tx: Tx,
  input: CreateFreshBookingInput,
  now: Date,
  slotIndex: SlotIndex,
  source: BookingSource,
): Promise<Booking> {
  const { day, ruleByIndex, slots } = await fetchDayAvailability(tx, input.date, now);
  const slot = slots.find((s) => s.index === slotIndex)!;
  assertSlotBookable(slot);

  const customer = await upsertCustomer(tx, {
    phone: input.phone,
    fullName: input.fullName,
    email: input.email,
    teamName: input.teamName,
  });

  if (source !== 'COUNTER') {
    const activeCount = await countActiveBookings(tx, customer.id, now);
    if (activeCount >= 2) {
      throw new BookingLimitExceededError();
    }
  }

  await tx.customer.update({ where: { id: customer.id }, data: { totalBookings: { increment: 1 } } });

  const reference = await nextReference(tx, now);
  const price = input.priceOverride ?? ruleByIndex.get(slotIndex)!.price;

  const booking = await tx.booking.create({
    data: {
      reference,
      customerId: customer.id,
      date: day,
      slotIndex,
      status: 'CONFIRMED',
      priceAmount: price,
      source,
      createdById: input.createdById ?? null,
      customerNote: input.note ?? null,
    },
  });

  await writeAudit(tx, { action: 'BOOKING_CREATED', entityId: booking.id, after: booking });
  return booking;
}

// ---------------------------------------------------------------- cancelBooking

export type CancelActor = { type: 'PUBLIC'; phone: string } | { type: 'STAFF'; userId: string };

export interface CancelBookingInput {
  bookingId: string;
  actor: CancelActor;
  reason?: string;
  now?: Date;
}

/** CONFIRMED -> CANCELLED. Public may cancel their own booking up to
 * CANCELLATION_WINDOW_HOURS before start; staff may cancel any time. */
export async function cancelBooking(input: CancelBookingInput): Promise<Booking> {
  const now = input.now ?? new Date();

  return prisma.$transaction(async (tx) => {
    const booking = await tx.booking.findUnique({ where: { id: input.bookingId }, include: { customer: true } });
    if (!booking) {
      throw new InvalidTransitionError('Booking not found.');
    }
    if (booking.status !== 'CONFIRMED') {
      throw new InvalidTransitionError(`Cannot cancel a booking with status ${booking.status}.`);
    }

    if (input.actor.type === 'PUBLIC') {
      if (booking.customer.phone !== input.actor.phone) {
        throw new NotAuthorizedError();
      }
      const start = slotStart(booking.date, booking.slotIndex as SlotIndex);
      const hoursUntilStart = (start.getTime() - now.getTime()) / 3_600_000;
      if (hoursUntilStart < CANCELLATION_WINDOW_HOURS) {
        throw new CancellationWindowError();
      }
    }

    const before = booking;
    const updated = await tx.booking.update({
      where: { id: booking.id },
      data: { status: 'CANCELLED', cancelledAt: now, cancelReason: input.reason ?? null },
    });

    await writeAudit(tx, {
      actorId: input.actor.type === 'STAFF' ? input.actor.userId : null,
      action: 'BOOKING_CANCELLED',
      entityId: updated.id,
      before,
      after: updated,
    });

    return updated;
  });
}

// ---------------------------------------------------------------- rescheduleBooking

export interface RescheduleBookingInput {
  bookingId: string;
  newDate: Date;
  newSlotIndex: number;
  staffUserId: string;
  now?: Date;
}

/** CONFIRMED -> CONFIRMED, same row, new (date, slotIndex). Staff only —
 * there is no public route for this. */
export async function rescheduleBooking(input: RescheduleBookingInput): Promise<Booking> {
  assertValidSlotIndex(input.newSlotIndex);
  const now = input.now ?? new Date();
  const newSlotIndex = input.newSlotIndex as SlotIndex;

  return runSerializable(async (tx) => {
    await sweepExpiredHolds(tx, now);

    const booking = await tx.booking.findUnique({ where: { id: input.bookingId } });
    if (!booking) {
      throw new InvalidTransitionError('Booking not found.');
    }
    if (booking.status !== 'CONFIRMED') {
      throw new InvalidTransitionError(`Cannot reschedule a booking with status ${booking.status}.`);
    }

    const { day, ruleByIndex, slots } = await fetchDayAvailability(tx, input.newDate, now, booking.id);
    const slot = slots.find((s) => s.index === newSlotIndex)!;
    assertSlotBookable(slot);

    const before = booking;
    const updated = await tx.booking.update({
      where: { id: booking.id },
      data: {
        date: day,
        slotIndex: newSlotIndex,
        priceAmount: ruleByIndex.get(newSlotIndex)!.price,
      },
    });

    await writeAudit(tx, {
      actorId: input.staffUserId,
      action: 'BOOKING_RESCHEDULED',
      entityId: updated.id,
      before,
      after: updated,
    });

    return updated;
  });
}

// ---------------------------------------------------------------- staff-only extras (step 6)

export interface CheckInBookingInput {
  bookingId: string;
  staffUserId: string;
  now?: Date;
}

/** One-tap check-in from the DayTimeline. A booking can't be checked in
 * before its slot starts. If the slot has ALREADY ended by the time staff
 * check someone in (a late check-in), it goes straight to COMPLETED. */
export async function checkInBooking(input: CheckInBookingInput): Promise<Booking> {
  const now = input.now ?? new Date();

  return prisma.$transaction(async (tx) => {
    const booking = await tx.booking.findUnique({ where: { id: input.bookingId } });
    if (!booking) throw new InvalidTransitionError('Booking not found.');
    if (booking.status !== 'CONFIRMED') {
      throw new InvalidTransitionError(`Cannot check in a booking with status ${booking.status}.`);
    }
    if (booking.checkedInAt) {
      throw new InvalidTransitionError('This booking is already checked in.');
    }
    if (!hasSlotStarted(booking.date, booking.slotIndex as SlotIndex, now)) {
      throw new InvalidTransitionError('This slot has not started yet.');
    }

    const before = booking;
    const alreadyOver = slotEnd(booking.date, booking.slotIndex as SlotIndex).getTime() <= now.getTime();
    const updated = await tx.booking.update({
      where: { id: booking.id },
      data: { checkedInAt: now, status: alreadyOver ? 'COMPLETED' : booking.status },
    });

    await writeAudit(tx, {
      actorId: input.staffUserId,
      action: 'BOOKING_CHECKED_IN',
      entityId: updated.id,
      before,
      after: updated,
    });
    return updated;
  });
}

export interface MarkNoShowInput {
  bookingId: string;
  staffUserId: string;
  now?: Date;
}

/** CONFIRMED -> NO_SHOW, staff only, and only once the slot has actually
 * started — you can't know someone is a no-show before their time. */
export async function markNoShow(input: MarkNoShowInput): Promise<Booking> {
  const now = input.now ?? new Date();

  return prisma.$transaction(async (tx) => {
    const booking = await tx.booking.findUnique({ where: { id: input.bookingId }, include: { customer: true } });
    if (!booking) throw new InvalidTransitionError('Booking not found.');
    if (booking.status !== 'CONFIRMED') {
      throw new InvalidTransitionError(`Cannot mark a booking with status ${booking.status} as no-show.`);
    }
    if (!hasSlotStarted(booking.date, booking.slotIndex as SlotIndex, now)) {
      throw new InvalidTransitionError('This slot has not started yet.');
    }

    const before = booking;
    const updated = await tx.booking.update({ where: { id: booking.id }, data: { status: 'NO_SHOW' } });
    await tx.customer.update({
      where: { id: booking.customerId },
      data: { totalNoShows: { increment: 1 } },
    });

    await writeAudit(tx, {
      actorId: input.staffUserId,
      action: 'BOOKING_NO_SHOW',
      entityId: updated.id,
      before,
      after: updated,
    });
    return updated;
  });
}

export interface RecordPaymentInput {
  bookingId: string;
  amount: number;
  method: PaymentMethod;
  staffUserId: string;
  note?: string;
  now?: Date;
}

/** Appends a Payment row (a booking can have several — CLAUDE.md §5) and
 * recomputes Booking.paymentStatus from the running total. */
export async function recordPayment(input: RecordPaymentInput): Promise<Booking> {
  if (input.amount <= 0) {
    throw new InvalidTransitionError('Payment amount must be greater than zero.');
  }
  const now = input.now ?? new Date();

  return prisma.$transaction(async (tx) => {
    const booking = await tx.booking.findUnique({ where: { id: input.bookingId } });
    if (!booking) throw new InvalidTransitionError('Booking not found.');

    await tx.payment.create({
      data: {
        bookingId: booking.id,
        amount: input.amount,
        method: input.method,
        receivedById: input.staffUserId,
        receivedAt: now,
        note: input.note ?? null,
      },
    });

    const newAmountPaid = Number(booking.amountPaid) + input.amount;
    const priceAmount = Number(booking.priceAmount);
    const paymentStatus = newAmountPaid <= 0 ? 'UNPAID' : newAmountPaid < priceAmount ? 'PARTIAL' : 'PAID';

    const before = booking;
    const updated = await tx.booking.update({
      where: { id: booking.id },
      data: { amountPaid: newAmountPaid, paymentStatus },
    });

    await writeAudit(tx, {
      actorId: input.staffUserId,
      action: 'PAYMENT_RECORDED',
      entityId: updated.id,
      before,
      after: updated,
    });
    return updated;
  });
}

export interface UpdateBookingNoteInput {
  bookingId: string;
  internalNote: string;
  staffUserId: string;
}

/** Staff-only internal note - never shown to the customer (that's
 * customerNote instead, which the customer themselves writes). No status
 * restriction: staff can annotate a booking regardless of its state. */
export async function updateBookingNote(input: UpdateBookingNoteInput): Promise<Booking> {
  return prisma.$transaction(async (tx) => {
    const booking = await tx.booking.findUnique({ where: { id: input.bookingId } });
    if (!booking) throw new InvalidTransitionError('Booking not found.');

    const before = booking;
    const updated = await tx.booking.update({
      where: { id: booking.id },
      data: { internalNote: input.internalNote },
    });

    await writeAudit(tx, {
      actorId: input.staffUserId,
      action: 'BOOKING_NOTE_UPDATED',
      entityId: updated.id,
      before,
      after: updated,
    });
    return updated;
  });
}

// Exported so a cron/API route could sweep on its own without duplicating
// the query, even though every write path here already sweeps inline.
export { sweepExpiredHolds };
