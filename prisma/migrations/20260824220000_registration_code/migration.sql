-- Registration codes: the gate on who may register a turf business.
--
-- Nobody can create a Tenant without redeeming one of these, which is what
-- makes the platform invite-only rather than open signup.
--
-- Two-phase by design (see schema.prisma's model doc): `redeemedAt` marks the
-- code as claimed, `tenantId` marks onboarding as finished. The gap between
-- them is what lets a half-finished signup resume instead of burning the code
-- and needing the operator to issue a replacement.
--
-- `RegistrationCode_tenantId_key` is the important one: it is what makes "one
-- code produces at most one business" a database guarantee rather than an
-- application check somebody could forget to write.
--
-- No backfill. Existing tenants (Tenant Zero) predate this and have no code —
-- deliberately, since they were never registered through this flow.
--
-- The generated diff's `CREATE UNIQUE INDEX "Booking_venueId_date_slotIndex_key"`
-- line was deleted by hand, as in every migration here: the live table carries
-- the PARTIAL index `one_live_booking_per_slot` instead, and a plain unique
-- would forbid rebooking a cancelled slot. See schema.prisma's bottom note.

-- CreateTable
CREATE TABLE "RegistrationCode" (
    "code" TEXT NOT NULL,
    "display" TEXT NOT NULL,
    "label" TEXT,
    "issuedToEmail" TEXT,
    "createdByClerkUserId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "redeemedAt" TIMESTAMP(3),
    "redeemedByClerkUserId" TEXT,
    "tenantId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RegistrationCode_pkey" PRIMARY KEY ("code")
);

-- CreateIndex
CREATE UNIQUE INDEX "RegistrationCode_tenantId_key" ON "RegistrationCode"("tenantId");

-- CreateIndex
CREATE INDEX "RegistrationCode_createdByClerkUserId_idx" ON "RegistrationCode"("createdByClerkUserId");

-- CreateIndex
CREATE INDEX "RegistrationCode_redeemedByClerkUserId_idx" ON "RegistrationCode"("redeemedByClerkUserId");
