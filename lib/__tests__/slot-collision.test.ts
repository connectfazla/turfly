/**
 * Regression coverage for booking-engine's P2002 discrimination.
 *
 * The bug: runSerializable() mapped EVERY unique-constraint violation to
 * SlotTakenError ("that slot was just booked by someone else"). Only the
 * one-live-booking-per-slot partial index actually means that. A collision
 * on Booking.reference — reachable whenever nextReference()'s count-based
 * sequence reuses a number after a row was hard-deleted — is retryable, and
 * reporting it as a lost race told the customer something untrue about a
 * booking that would have succeeded on a second attempt.
 */
import { describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';
import { isSlotCollision } from '../booking-engine';

function p2002(target: string | string[] | undefined): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
    meta: target === undefined ? {} : { target },
  });
}

describe('isSlotCollision', () => {
  it('treats the partial slot index as a genuine slot race', () => {
    expect(isSlotCollision(p2002('one_live_booking_per_slot'))).toBe(true);
  });

  it('treats the index reported as column names as a slot race', () => {
    // Prisma reports compound uniques as a string[] of columns rather than
    // the index name, so both shapes have to resolve to the same verdict.
    expect(isSlotCollision(p2002(['date', 'slotIndex']))).toBe(true);
  });

  it('does NOT treat a reference collision as a slot race', () => {
    expect(isSlotCollision(p2002('reference'))).toBe(false);
    expect(isSlotCollision(p2002(['reference']))).toBe(false);
  });

  it('falls back to "slot race" when Prisma reports no target', () => {
    // Conservative direction on purpose: a spurious "slot taken" is a bad
    // message but a safe outcome, whereas retrying a real slot collision
    // risks a double booking.
    expect(isSlotCollision(p2002(undefined))).toBe(true);
  });

  it('ignores errors that are not Prisma known-request errors', () => {
    expect(isSlotCollision(new Error('nope'))).toBe(false);
    expect(isSlotCollision(null)).toBe(false);
  });
});
