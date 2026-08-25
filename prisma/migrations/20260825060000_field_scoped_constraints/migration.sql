-- Multi-field / multi-sport pass, step 3 of 3 — run ONLY after
-- scripts/backfill-fields.ts reports zero remaining NULL fieldId rows
-- (it refuses to let you proceed otherwise). Makes fieldId NOT NULL on
-- all three tables, drops the old venue-scoped uniques, and replaces them
-- with field-scoped ones — including hand-writing the partial index the
-- same way every prior widening of one_live_booking_per_slot has (Prisma's
-- `@@unique(...)` placeholder cannot express a WHERE clause; see
-- prisma/schema.prisma's bottom note).

-- SlotRule/Blackout's old venue-wide uniques must go BEFORE fieldId can be
-- relied on as the new uniqueness key — a venue with 2 fields now has 224
-- SlotRule rows (112 each), which the old (venueId, dayOfWeek, slotIndex)
-- constraint would reject outright.
DROP INDEX "SlotRule_venueId_dayOfWeek_slotIndex_key";
DROP INDEX "Blackout_venueId_date_slotIndex_key";

ALTER TABLE "SlotRule" ALTER COLUMN "fieldId" SET NOT NULL;
ALTER TABLE "Blackout" ALTER COLUMN "fieldId" SET NOT NULL;
ALTER TABLE "Booking" ALTER COLUMN "fieldId" SET NOT NULL;

CREATE UNIQUE INDEX "SlotRule_fieldId_dayOfWeek_slotIndex_key" ON "SlotRule"("fieldId", "dayOfWeek", "slotIndex");
CREATE UNIQUE INDEX "Blackout_fieldId_date_slotIndex_key" ON "Blackout"("fieldId", "date", "slotIndex");

-- The correctness-critical one: replace the venue-scoped partial index with
-- a venue+field-scoped one. venueId stays in the key even though fieldId
-- already implies it (see Booking.fieldId's doc comment in schema.prisma)
-- — free for query-planning, not load-bearing for correctness.
DROP INDEX "one_live_booking_per_slot";
CREATE UNIQUE INDEX "one_live_booking_per_slot"
ON "Booking" ("venueId", "fieldId", date, "slotIndex")
WHERE status IN ('HELD','CONFIRMED','COMPLETED','PENDING_VERIFICATION');
