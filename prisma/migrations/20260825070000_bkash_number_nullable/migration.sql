-- Venue.bkashNumber: drop the "01700000000" default and make it nullable.
--
-- The default meant a brand-new venue was immediately live and bookable
-- with an unconfigured bKash number that LOOKED like a real one — found by
-- checking the actual production database, where Venue Zero itself still
-- had it. Backfill clears any row still holding that exact placeholder
-- (nobody's real bKash number coincidentally equals it) so the app's
-- existing "not configured" fallback paths (already written throughout
-- the codebase — confirm-form.tsx, verify-payment-form.tsx — but dead code
-- until now, since the field was never actually empty) start firing.

ALTER TABLE "Venue" ALTER COLUMN "bkashNumber" DROP NOT NULL;
ALTER TABLE "Venue" ALTER COLUMN "bkashNumber" DROP DEFAULT;

UPDATE "Venue" SET "bkashNumber" = NULL WHERE "bkashNumber" = '01700000000';
