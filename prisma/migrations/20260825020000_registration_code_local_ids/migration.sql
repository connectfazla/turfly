-- RegistrationCode: Clerk ids become local User ids.
--
-- Renames rather than drop-and-add, so the audit trail survives: who issued a
-- code and who claimed it are the two questions this table exists to answer,
-- and recreating the columns would answer neither for anything issued before
-- today.
--
-- NOT foreign keys, deliberately. A code can be claimed by someone whose
-- account is later deleted, and a dangling id that still records "this was
-- claimed" is strictly more useful than a cascade that erases the fact.
--
-- The values in these columns are Clerk ids for any code issued before this
-- migration. That is fine and intentional: those codes are either already
-- redeemed (so the tenantId is what matters) or unredeemed (so the claimant
-- is null). Nothing resolves an old issuer id to a user, and nothing needs to.

ALTER TABLE "RegistrationCode" RENAME COLUMN "createdByClerkUserId" TO "createdByUserId";
ALTER TABLE "RegistrationCode" RENAME COLUMN "redeemedByClerkUserId" TO "redeemedByUserId";

ALTER INDEX "RegistrationCode_createdByClerkUserId_idx" RENAME TO "RegistrationCode_createdByUserId_idx";
ALTER INDEX "RegistrationCode_redeemedByClerkUserId_idx" RENAME TO "RegistrationCode_redeemedByUserId_idx";
