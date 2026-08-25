-- Replace Clerk with in-house credential auth.
--
-- ORDERING IS THE WHOLE POINT of writing this by hand. Prisma's generated diff
-- drops the Clerk columns and adds the new ones in the same breath, which
-- would have discarded the mapping between them — the operator's PlatformAdmin
-- row and Tenant Zero's ownership both key off clerkUserId, and once that
-- column is gone there is nothing left to resolve them against. Every DROP
-- below happens only after the value it carried has been copied somewhere.
--
-- New tables: Session (server-side, so revoking access is immediate — a
-- stateless JWT cannot be revoked before it expires) and VerificationToken
-- (invite / verify / reset). Both store a SHA-256 of the credential, never the
-- credential itself, so a leaked backup contains nothing usable.
--
-- Existing users are marked emailVerifiedAt = now() because Clerk had already
-- verified them; re-verifying addresses that were proven under the previous
-- system would lock out the only accounts that exist.
--
-- Existing users have NO password. They must use the forgotten-password flow
-- to set one. That is deliberate — this migration cannot invent a credential,
-- and it must not leave an account that authenticates without one.
--
-- The generated diff's plain `Booking_venueId_date_slotIndex_key` line was
-- deleted by hand as always; the live table carries the PARTIAL index
-- `one_live_booking_per_slot`.

-- CreateEnum
CREATE TYPE "VerificationTokenType" AS ENUM ('INVITE', 'EMAIL_VERIFY', 'PASSWORD_RESET');

-- ---------------------------------------------------------------- User
ALTER TABLE "User" ADD COLUMN "emailVerifiedAt" TIMESTAMP(3);

-- Anyone who had bound a Clerk account had a verified address there.
UPDATE "User" SET "emailVerifiedAt" = CURRENT_TIMESTAMP WHERE "clerkUserId" IS NOT NULL;

-- ---------------------------------------------------------------- Tenant
ALTER TABLE "Tenant" ADD COLUMN "ownerUserId" TEXT;

UPDATE "Tenant" t
   SET "ownerUserId" = u.id
  FROM "User" u
 WHERE u."clerkUserId" = t."ownerClerkUserId";

-- ------------------------------------------------------- PlatformAdmin
ALTER TABLE "PlatformAdmin" ADD COLUMN "userId" TEXT;

UPDATE "PlatformAdmin" p
   SET "userId" = u.id
  FROM "User" u
 WHERE u."clerkUserId" = p."clerkUserId";

-- A platform admin whose Clerk id matches no local User cannot be carried
-- across — there is no identity to point at. Deleting is correct and safe:
-- scripts/grant-platform-admin.ts re-grants by email in one command.
DELETE FROM "PlatformAdmin" WHERE "userId" IS NULL;

ALTER TABLE "PlatformAdmin" DROP CONSTRAINT "PlatformAdmin_pkey";
ALTER TABLE "PlatformAdmin" DROP COLUMN "clerkUserId";
ALTER TABLE "PlatformAdmin" DROP COLUMN "name";
ALTER TABLE "PlatformAdmin" DROP COLUMN "email";
ALTER TABLE "PlatformAdmin" ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "PlatformAdmin" ADD CONSTRAINT "PlatformAdmin_pkey" PRIMARY KEY ("userId");

-- --------------------------------------------- drop the Clerk columns
DROP INDEX IF EXISTS "Customer_clerkUserId_key";
DROP INDEX IF EXISTS "Tenant_clerkOrgId_idx";
DROP INDEX IF EXISTS "Tenant_clerkOrgId_key";
DROP INDEX IF EXISTS "Tenant_ownerClerkUserId_key";
DROP INDEX IF EXISTS "User_clerkUserId_key";
DROP INDEX IF EXISTS "User_invitedEmail_idx";
DROP INDEX IF EXISTS "User_role_isActive_idx";

ALTER TABLE "Customer" DROP COLUMN "clerkUserId";
ALTER TABLE "Tenant"   DROP COLUMN "clerkOrgId";
ALTER TABLE "Tenant"   DROP COLUMN "ownerClerkUserId";
ALTER TABLE "User"     DROP COLUMN "clerkUserId";
ALTER TABLE "User"     DROP COLUMN "invitedEmail";
ALTER TABLE "User"     DROP COLUMN "role";

-- The Role enum has no remaining referents.
DROP TYPE IF EXISTS "Role";

-- ---------------------------------------------------------------- Session
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userAgent" TEXT,
    "ip" TEXT,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "VerificationToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "VerificationTokenType" NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VerificationToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");
CREATE INDEX "VerificationToken_userId_type_idx" ON "VerificationToken"("userId", "type");
CREATE INDEX "VerificationToken_expiresAt_idx" ON "VerificationToken"("expiresAt");
CREATE UNIQUE INDEX "Tenant_ownerUserId_key" ON "Tenant"("ownerUserId");
CREATE INDEX "Tenant_ownerUserId_idx" ON "Tenant"("ownerUserId");
CREATE INDEX "User_isActive_idx" ON "User"("isActive");

-- AddForeignKey
ALTER TABLE "Tenant" ADD CONSTRAINT "Tenant_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PlatformAdmin" ADD CONSTRAINT "PlatformAdmin_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VerificationToken" ADD CONSTRAINT "VerificationToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
