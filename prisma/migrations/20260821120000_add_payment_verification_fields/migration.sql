-- Payment-verification feature: additive changes only. The partial unique
-- index that uses the new BookingStatus value below is a SEPARATE, LATER
-- migration (see prisma/schema.prisma's bottom note) — Postgres will not
-- let a transaction both add an enum value and use that value in the same
-- transaction, and this whole file runs as one transaction.

-- New BookingStatus value: slot stays exclusively reserved while staff
-- verify a customer's submitted bKash advance TRXN.
ALTER TYPE "BookingStatus" ADD VALUE 'PENDING_VERIFICATION';

-- New enum: distinguishes a self-reported, not-yet-checked payment claim
-- from a staff-recorded (already physically received) one.
CREATE TYPE "PaymentClaimStatus" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED');

-- Customer: address, mandatory going forward at the Zod layer, nullable
-- here so existing rows never need a backfill.
ALTER TABLE "Customer" ADD COLUMN "address" TEXT;

-- Booking: failsafe auto-expiry deadline for PENDING_VERIFICATION, mirrors
-- holdExpiresAt's role for HELD.
ALTER TABLE "Booking" ADD COLUMN "paymentVerificationExpiresAt" TIMESTAMP(3);

-- Payment: receivedById becomes optional (a PENDING claim has no staff
-- receiver yet), plus the new verification-tracking columns.
ALTER TABLE "Payment" DROP CONSTRAINT "Payment_receivedById_fkey";
ALTER TABLE "Payment" ALTER COLUMN "receivedById" DROP NOT NULL;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_receivedById_fkey"
  FOREIGN KEY ("receivedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD COLUMN "status" "PaymentClaimStatus" NOT NULL DEFAULT 'VERIFIED';
ALTER TABLE "Payment" ADD COLUMN "trxId" TEXT;
ALTER TABLE "Payment" ADD COLUMN "rejectedReason" TEXT;
CREATE INDEX "Payment_status_idx" ON "Payment"("status");

-- VenueSetting: bKash wallet number + advance amount + verification
-- deadline, all admin-editable (never hard-coded, never redeployed to
-- change).
ALTER TABLE "VenueSetting" ADD COLUMN "bkashNumber" TEXT NOT NULL DEFAULT '01700000000';
ALTER TABLE "VenueSetting" ADD COLUMN "advanceAmount" DECIMAL(10,2) NOT NULL DEFAULT 1000;
ALTER TABLE "VenueSetting" ADD COLUMN "paymentVerificationHours" INTEGER NOT NULL DEFAULT 24;
