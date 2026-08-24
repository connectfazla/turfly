-- Migration B, part 2: venueId NOT NULL everywhere, and the
-- one-live-booking-per-slot partial index becomes venue-scoped.
--
-- Prerequisites, both verified before writing this:
--   * zero rows with venueId IS NULL on Booking / SlotRule / Blackout /
--     Payment (scripts/backfill-tenant-zero.ts has run);
--   * lib/booking-engine.ts requires a venueId on every create path, so
--     nothing can insert a null from here on.
--
-- TWO HAND EDITS to the generated diff, both essential:
--
--   1. The diff proposed `CREATE UNIQUE INDEX
--      "Booking_venueId_date_slotIndex_key" ON "Booking"("venueId", date,
--      "slotIndex")` — a PLAIN unique. That is WRONG and would break the
--      product: it would forbid a second booking of the same slot even
--      after the first was CANCELLED or EXPIRED, so any cancelled slot
--      could never be rebooked. The @@unique in schema.prisma is only a
--      placeholder telling Prisma the shape; the real object is the
--      partial index created below, whose WHERE clause is what limits the
--      constraint to LIVE bookings. See schema.prisma's bottom note.
--
--   2. The old index is dropped and recreated rather than altered —
--      Postgres has no ALTER INDEX for a key change.
--
-- The predicate keeps all four live statuses, unchanged from the existing
-- index: PENDING_VERIFICATION occupies the slot exclusively too, since a
-- customer who has submitted a bKash TRXN is waiting on staff, not queuing
-- behind other customers.
--
-- Adds no enum values, so this is safe as a single migration (the
-- "ALTER TYPE ... ADD VALUE then use it in the same transaction" trap that
-- forced an earlier split does not apply here).

-- AlterTable
ALTER TABLE "Booking"  ALTER COLUMN "venueId" SET NOT NULL;
ALTER TABLE "SlotRule" ALTER COLUMN "venueId" SET NOT NULL;
ALTER TABLE "Blackout" ALTER COLUMN "venueId" SET NOT NULL;
ALTER TABLE "Payment"  ALTER COLUMN "venueId" SET NOT NULL;

-- DropForeignKey (re-added below, now against NOT NULL columns)
ALTER TABLE "Booking"  DROP CONSTRAINT "Booking_venueId_fkey";
ALTER TABLE "SlotRule" DROP CONSTRAINT "SlotRule_venueId_fkey";
ALTER TABLE "Blackout" DROP CONSTRAINT "Blackout_venueId_fkey";
ALTER TABLE "Payment"  DROP CONSTRAINT "Payment_venueId_fkey";

-- The real constraint: venue-scoped, and PARTIAL so cancelled/expired rows
-- free the slot again.
DROP INDEX IF EXISTS "one_live_booking_per_slot";
CREATE UNIQUE INDEX "one_live_booking_per_slot"
  ON "Booking" ("venueId", date, "slotIndex")
  WHERE status IN ('HELD', 'CONFIRMED', 'COMPLETED', 'PENDING_VERIFICATION');

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SlotRule" ADD CONSTRAINT "SlotRule_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Blackout" ADD CONSTRAINT "Blackout_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
