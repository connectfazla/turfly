-- Tenant isolation: venue-scope the SlotRule and Blackout unique keys.
--
-- Migration B, part 1 of 2. This half is split out and shipped early because
-- it is a hard prerequisite for a second venue existing AT ALL: the old
-- global (dayOfWeek, slotIndex) key meant a second venue's 112-row price
-- grid collided with Venue Zero's row-for-row, so there was no way to create
-- one to test isolation against.
--
-- Booking's partial index is deliberately NOT touched here. It stays
-- (date, slotIndex) until the engine's queries are actually venue-aware —
-- widening it before then buys nothing and would make the concurrency
-- behavior harder to reason about while that work is in flight. Part 2
-- (Booking's index + venueId NOT NULL on all four tables) ships with it.
--
-- Safe to apply: verified zero rows with venueId IS NULL on either table
-- before writing this, so no existing row can violate the new keys.
--
-- As always, the generated diff's `CREATE UNIQUE INDEX
-- "Booking_date_slotIndex_key"` line was deleted by hand — the live table
-- carries the hand-written partial index `one_live_booking_per_slot`
-- instead, and the schema's plain @@unique is only a placeholder so Prisma
-- knows the shape. See schema.prisma's bottom note.

-- DropIndex
DROP INDEX "Blackout_date_slotIndex_key";

-- DropIndex
DROP INDEX "SlotRule_dayOfWeek_slotIndex_key";

-- CreateIndex
CREATE UNIQUE INDEX "Blackout_venueId_date_slotIndex_key" ON "Blackout"("venueId", "date", "slotIndex");

-- CreateIndex
CREATE UNIQUE INDEX "SlotRule_venueId_dayOfWeek_slotIndex_key" ON "SlotRule"("venueId", "dayOfWeek", "slotIndex");
