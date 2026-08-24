-- Per-venue booking-reference sequence.
--
-- Replaces `booking.count({ where: { reference: { startsWith: prefix } } })`
-- as the source of the NNNN in TRF-{venueCode}-YYYY-NNNN. That count was
-- wrong two ways: deleting any booking made the next count collide with an
-- existing reference (Booking.reference is unique, so the insert failed),
-- and it scanned every booking of that year on every single creation, inside
-- a Serializable transaction, growing without bound.
--
-- Backfill: none needed. A venue with no counter row starts at 1, and the
-- only venue with existing bookings is Venue Zero, whose legacy references
-- use the old TRF-YYYY-NNNN format and therefore cannot collide with the new
-- TRF-{code}-YYYY-NNNN one. Legacy references stay valid and looked-up-able
-- (lib/schemas/booking.ts's REFERENCE_RE accepts both shapes).
--
-- The generated diff's `CREATE UNIQUE INDEX "Booking_date_slotIndex_key"`
-- line was deleted by hand, as in every migration here — the live table
-- carries the partial index `one_live_booking_per_slot` instead.

-- CreateTable
CREATE TABLE "VenueReferenceCounter" (
    "venueId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "next" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "VenueReferenceCounter_pkey" PRIMARY KEY ("venueId","year")
);
