-- Multi-tenant SaaS conversion, Phase 0: additive-only.
--
-- Adds Tenant/Venue/VenueStaff/PlatformAdmin, and a NULLABLE venueId (plus
-- tenantId on Booking/AuditLog) to every existing model. VenueSetting is
-- untouched here — it's retired in a FOLLOW-UP migration, after
-- scripts/backfill-tenant-zero.ts has read its one row to create "Venue
-- Zero". The Booking/SlotRule/Blackout partial/plain unique indexes are
-- deliberately left exactly as they are (see the schema.prisma bottom
-- note) — this migration does not touch them.
--
-- Generated via `prisma migrate diff --from-schema-datasource --to-schema-datamodel`
-- (non-interactive; `prisma migrate dev` requires a TTY this environment
-- doesn't have) and then hand-edited: the auto-generated diff proposed
-- `CREATE UNIQUE INDEX "Booking_date_slotIndex_key" ON "Booking"("date",
-- "slotIndex")` because the live table's partial index
-- `one_live_booking_per_slot` doesn't match the plain-unique shape Prisma
-- expects from the schema's placeholder `@@unique(...)` declaration (see
-- CLAUDE.md / schema.prisma's own note on this). That line is removed
-- below — the existing partial index stays exactly as-is, untouched.

-- CreateEnum
CREATE TYPE "VenueStaffRole" AS ENUM ('MANAGER', 'BOOKIE');

-- AlterTable
ALTER TABLE "AuditLog" ADD COLUMN     "tenantId" TEXT,
ADD COLUMN     "venueId" TEXT;

-- AlterTable
ALTER TABLE "Blackout" ADD COLUMN     "venueId" TEXT;

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "tenantId" TEXT,
ADD COLUMN     "venueId" TEXT;

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "clerkUserId" TEXT;

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "venueId" TEXT;

-- AlterTable
ALTER TABLE "SlotRule" ADD COLUMN     "venueId" TEXT;

-- CreateTable
CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL,
    "clerkOrgId" TEXT,
    "name" TEXT NOT NULL,
    "ownerClerkUserId" TEXT,
    "ownerEmail" TEXT,
    "plan" TEXT NOT NULL DEFAULT 'free',
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Venue" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contactPhone" TEXT NOT NULL,
    "contactEmail" TEXT,
    "rulesText" TEXT NOT NULL,
    "holdMinutes" INTEGER NOT NULL DEFAULT 10,
    "cancellationWindowHours" INTEGER NOT NULL DEFAULT 6,
    "bookingWindowDays" INTEGER NOT NULL DEFAULT 14,
    "bkashNumber" TEXT NOT NULL DEFAULT '01700000000',
    "depositPercent" INTEGER NOT NULL DEFAULT 30,
    "paymentVerificationHours" INTEGER NOT NULL DEFAULT 24,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Dhaka',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Venue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VenueStaff" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clerkUserId" TEXT NOT NULL,
    "role" "VenueStaffRole" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "name" TEXT,
    "email" TEXT,
    "invitedByClerkUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VenueStaff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformAdmin" (
    "clerkUserId" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformAdmin_pkey" PRIMARY KEY ("clerkUserId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_clerkOrgId_key" ON "Tenant"("clerkOrgId");

-- CreateIndex
CREATE INDEX "Tenant_clerkOrgId_idx" ON "Tenant"("clerkOrgId");

-- CreateIndex
CREATE UNIQUE INDEX "Venue_slug_key" ON "Venue"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Venue_code_key" ON "Venue"("code");

-- CreateIndex
CREATE INDEX "Venue_tenantId_idx" ON "Venue"("tenantId");

-- CreateIndex
CREATE INDEX "VenueStaff_tenantId_idx" ON "VenueStaff"("tenantId");

-- CreateIndex
CREATE INDEX "VenueStaff_clerkUserId_idx" ON "VenueStaff"("clerkUserId");

-- CreateIndex
CREATE UNIQUE INDEX "VenueStaff_venueId_clerkUserId_key" ON "VenueStaff"("venueId", "clerkUserId");

-- CreateIndex
CREATE INDEX "AuditLog_venueId_idx" ON "AuditLog"("venueId");

-- CreateIndex
CREATE INDEX "AuditLog_tenantId_idx" ON "AuditLog"("tenantId");

-- CreateIndex
CREATE INDEX "Blackout_venueId_idx" ON "Blackout"("venueId");

-- CreateIndex
CREATE INDEX "Booking_venueId_idx" ON "Booking"("venueId");

-- NOTE: the auto-generated diff proposed
--   CREATE UNIQUE INDEX "Booking_date_slotIndex_key" ON "Booking"("date", "slotIndex");
-- here. Deliberately omitted — see the header comment above. The live
-- partial index `one_live_booking_per_slot` already enforces this, and a
-- second plain unique constraint on the same columns would be redundant
-- (harmless, but pointless) at best and confusing at worst.

-- CreateIndex
CREATE UNIQUE INDEX "Customer_clerkUserId_key" ON "Customer"("clerkUserId");

-- CreateIndex
CREATE INDEX "Payment_venueId_idx" ON "Payment"("venueId");

-- CreateIndex
CREATE INDEX "SlotRule_venueId_idx" ON "SlotRule"("venueId");

-- AddForeignKey
ALTER TABLE "Venue" ADD CONSTRAINT "Venue_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VenueStaff" ADD CONSTRAINT "VenueStaff_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SlotRule" ADD CONSTRAINT "SlotRule_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Blackout" ADD CONSTRAINT "Blackout_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE SET NULL ON UPDATE CASCADE;
