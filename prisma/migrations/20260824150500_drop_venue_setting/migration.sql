-- Multi-tenant SaaS conversion, Phase 0 (part 2): retire VenueSetting.
--
-- Must run AFTER scripts/backfill-tenant-zero.ts, which is the last
-- reader of this table (it copies the singleton row's fields onto
-- "Venue Zero" before this migration drops the table out from under it).
--
-- Same "don't destroy data you haven't copied yet" reasoning as every
-- other multi-step migration in this file — see schema.prisma's bottom
-- note. Not an enum-in-transaction issue this time, just ordinary
-- migrate-then-cutover safety.

DROP TABLE "VenueSetting";
