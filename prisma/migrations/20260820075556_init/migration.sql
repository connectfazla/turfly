-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'MODERATOR');

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('HELD', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'EXPIRED', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('UNPAID', 'PARTIAL', 'PAID', 'REFUNDED');

-- CreateEnum
CREATE TYPE "BookingSource" AS ENUM ('ONLINE', 'COUNTER');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'BKASH', 'NAGAD', 'BANK_TRANSFER', 'CARD', 'OTHER');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'MODERATOR',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "email" TEXT,
    "teamName" TEXT,
    "totalBookings" INTEGER NOT NULL DEFAULT 0,
    "totalNoShows" INTEGER NOT NULL DEFAULT 0,
    "isBlocked" BOOLEAN NOT NULL DEFAULT false,
    "blockedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Booking" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "slotIndex" INTEGER NOT NULL,
    "status" "BookingStatus" NOT NULL DEFAULT 'HELD',
    "holdExpiresAt" TIMESTAMP(3),
    "priceAmount" DECIMAL(10,2) NOT NULL,
    "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'UNPAID',
    "amountPaid" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "source" "BookingSource" NOT NULL DEFAULT 'ONLINE',
    "createdById" TEXT,
    "checkedInAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "customerNote" TEXT,
    "internalNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Booking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SlotRule" (
    "id" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "slotIndex" INTEGER NOT NULL,
    "isBookable" BOOLEAN NOT NULL DEFAULT true,
    "price" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "SlotRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Blackout" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "slotIndex" INTEGER,
    "reason" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Blackout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VenueSetting" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "venueName" TEXT NOT NULL,
    "contactPhone" TEXT NOT NULL,
    "contactEmail" TEXT,
    "rulesText" TEXT NOT NULL,
    "holdMinutes" INTEGER NOT NULL DEFAULT 10,
    "cancellationWindowHours" INTEGER NOT NULL DEFAULT 6,
    "bookingWindowDays" INTEGER NOT NULL DEFAULT 14,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VenueSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "method" "PaymentMethod" NOT NULL DEFAULT 'CASH',
    "receivedById" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_role_isActive_idx" ON "User"("role", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_phone_key" ON "Customer"("phone");

-- CreateIndex
CREATE INDEX "Customer_fullName_idx" ON "Customer"("fullName");

-- CreateIndex
CREATE INDEX "Customer_isBlocked_idx" ON "Customer"("isBlocked");

-- CreateIndex
CREATE UNIQUE INDEX "Booking_reference_key" ON "Booking"("reference");

-- CreateIndex
CREATE INDEX "Booking_date_status_idx" ON "Booking"("date", "status");

-- CreateIndex
CREATE INDEX "Booking_customerId_idx" ON "Booking"("customerId");

-- CreateIndex
CREATE INDEX "Booking_status_holdExpiresAt_idx" ON "Booking"("status", "holdExpiresAt");

-- CreateIndex
CREATE INDEX "Booking_reference_idx" ON "Booking"("reference");

-- CreateIndex
-- NOTE: This is deliberately NOT a plain unique index. A plain unique index on
-- (date, slotIndex) would block re-booking a slot forever after a single
-- cancellation, because cancelled rows stay in the table. Instead we enforce
-- "at most one LIVE booking per slot" with a partial index — see CLAUDE.md §2.
CREATE UNIQUE INDEX "one_live_booking_per_slot"
ON "Booking" ("date", "slotIndex")
WHERE "status" IN ('HELD', 'CONFIRMED', 'COMPLETED');

-- CreateIndex
CREATE INDEX "SlotRule_dayOfWeek_idx" ON "SlotRule"("dayOfWeek");

-- CreateIndex
CREATE UNIQUE INDEX "SlotRule_dayOfWeek_slotIndex_key" ON "SlotRule"("dayOfWeek", "slotIndex");

-- CreateIndex
CREATE INDEX "Blackout_date_idx" ON "Blackout"("date");

-- CreateIndex
CREATE UNIQUE INDEX "Blackout_date_slotIndex_key" ON "Blackout"("date", "slotIndex");

-- CreateIndex
CREATE INDEX "Payment_bookingId_idx" ON "Payment"("bookingId");

-- CreateIndex
CREATE INDEX "Payment_receivedAt_idx" ON "Payment"("receivedAt");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_createdAt_idx" ON "AuditLog"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Blackout" ADD CONSTRAINT "Blackout_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_receivedById_fkey" FOREIGN KEY ("receivedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
