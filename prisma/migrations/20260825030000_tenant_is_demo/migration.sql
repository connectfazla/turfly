-- Marks the sandbox tenant scripts/create-demo-venue.ts seeds for the public,
-- no-password demo login. Gates two behaviors elsewhere: inviteStaffAction
-- refuses to send real invitation email for a demo tenant (the demo login is
-- public and unauthenticated, so without this guard it is a free email
-- relay), and setStaffActiveAction / changeStaffRoleAction refuse to touch
-- the two seeded accounts the role-switcher depends on.
--
-- (The generated diff also proposed `CREATE TYPE "Role"` — a leftover,
-- unused enum still declared in schema.prisma from before the Clerk cutover
-- dropped every column that referenced it. Not applied here; cleaning up an
-- orphaned enum declaration is unrelated to this migration.)

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN "isDemo" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "Tenant_isDemo_idx" ON "Tenant"("isDemo");
