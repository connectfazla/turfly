-- Multi-field / multi-sport pass, step 1 of 2 — additive-only, exactly the
-- same nullable-then-NOT-NULL shape the original venueId rollout used (see
-- prisma/schema.prisma's bottom note). Booking/SlotRule/Blackout's old
-- venue-scoped constraints are untouched here; they're dropped in the
-- follow-up migration once scripts/backfill-fields.ts has given every
-- existing row a fieldId. The Field->Venue and *->Field foreign keys ARE
-- added here, even though the columns are still nullable — a FK permits
-- NULL and only checks rows that have a value, so this is free referential
-- integrity for the backfill script that runs next, not something that
-- needs to wait for step 2.
--
-- Generated via `prisma migrate diff --from-schema-datasource --to-schema-
-- datamodel --script` and hand-split: the raw diff proposed fieldId as
-- NOT NULL immediately, which fails on every one of the three tables' many
-- existing rows, and proposed a plain (not partial) replacement for
-- one_live_booking_per_slot — both handled correctly in step 2 instead.

-- CreateTable
CREATE TABLE "Field" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sportName" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Field_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Field_venueId_idx" ON "Field"("venueId");

ALTER TABLE "Field" ADD CONSTRAINT "Field_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable (nullable — populated by scripts/backfill-fields.ts, then
-- made NOT NULL in the follow-up migration)
ALTER TABLE "Booking" ADD COLUMN "fieldId" TEXT;
ALTER TABLE "SlotRule" ADD COLUMN "fieldId" TEXT;
ALTER TABLE "Blackout" ADD COLUMN "fieldId" TEXT;

CREATE INDEX "Booking_fieldId_idx" ON "Booking"("fieldId");
CREATE INDEX "SlotRule_fieldId_idx" ON "SlotRule"("fieldId");
CREATE INDEX "Blackout_fieldId_idx" ON "Blackout"("fieldId");

ALTER TABLE "Booking" ADD CONSTRAINT "Booking_fieldId_fkey" FOREIGN KEY ("fieldId") REFERENCES "Field"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SlotRule" ADD CONSTRAINT "SlotRule_fieldId_fkey" FOREIGN KEY ("fieldId") REFERENCES "Field"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Blackout" ADD CONSTRAINT "Blackout_fieldId_fkey" FOREIGN KEY ("fieldId") REFERENCES "Field"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
