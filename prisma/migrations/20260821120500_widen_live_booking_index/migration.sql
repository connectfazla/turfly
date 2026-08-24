-- Widens the double-booking-prevention index to also cover
-- PENDING_VERIFICATION, so a slot stays exclusively reserved while staff
-- verify a customer's submitted bKash advance TRXN — not just while HELD/
-- CONFIRMED/COMPLETED. Must run AFTER the migration that adds the
-- PENDING_VERIFICATION enum value (Postgres forbids using a new enum
-- value in the same transaction that added it).
DROP INDEX "one_live_booking_per_slot";

CREATE UNIQUE INDEX one_live_booking_per_slot
ON "Booking" (date, "slotIndex")
WHERE status IN ('HELD','CONFIRMED','COMPLETED','PENDING_VERIFICATION');
