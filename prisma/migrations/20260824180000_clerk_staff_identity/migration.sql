-- Clerk cutover, Migration M1: staff identity.
--
-- Generated with `prisma migrate diff --from-schema-datasource
-- --to-schema-datamodel --script`, then hand-edited (this project cannot run
-- `prisma migrate dev` — no interactive TTY). Two deliberate edits:
--
--   1. The generated output's `CREATE UNIQUE INDEX "Booking_date_slotIndex_key"`
--      line was DELETED. The live table carries the hand-written partial index
--      `one_live_booking_per_slot` instead; the schema's plain @@unique is only
--      a placeholder so Prisma knows the shape. See schema.prisma's bottom note
--      — every migration in this project has to strip this same line.
--
--   2. The Payment_receivedById_fkey drop/re-add is NOT churn. The live
--      constraint is ON DELETE RESTRICT, but `receivedBy` is an optional
--      relation, so Prisma's model is SET NULL. Pre-existing drift from an
--      earlier migration; correcting it here is the right behavior (deleting a
--      staff account should null the reference, not block the delete).
--
-- VenueStaff is restructured rather than migrated: it has zero rows (verified
-- before writing this), so ADD COLUMN "userId" NOT NULL is safe with no default.

-- DropIndex
DROP INDEX "VenueStaff_clerkUserId_idx";

-- DropIndex
DROP INDEX "VenueStaff_venueId_clerkUserId_key";

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "clerkUserId" TEXT,
ADD COLUMN     "invitedEmail" TEXT,
ALTER COLUMN "passwordHash" DROP NOT NULL;

-- AlterTable
ALTER TABLE "VenueStaff" DROP COLUMN "clerkUserId",
DROP COLUMN "email",
DROP COLUMN "invitedByClerkUserId",
DROP COLUMN "name",
ADD COLUMN     "invitedByUserId" TEXT,
ADD COLUMN     "userId" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "User_clerkUserId_key" ON "User"("clerkUserId");

-- CreateIndex
CREATE INDEX "User_invitedEmail_idx" ON "User"("invitedEmail");

-- CreateIndex
CREATE INDEX "VenueStaff_userId_idx" ON "VenueStaff"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "VenueStaff_venueId_userId_key" ON "VenueStaff"("venueId", "userId");

-- AddForeignKey
ALTER TABLE "VenueStaff" ADD CONSTRAINT "VenueStaff_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- DropForeignKey
ALTER TABLE "Payment" DROP CONSTRAINT "Payment_receivedById_fkey";

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_receivedById_fkey" FOREIGN KEY ("receivedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
