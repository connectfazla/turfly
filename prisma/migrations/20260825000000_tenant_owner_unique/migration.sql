-- One business per owner, enforced by the database.
--
-- Onboarding already checks for an existing tenant before provisioning and
-- returns it rather than erroring, but that check loses a race: a
-- double-submitted form fires two requests that both read "no tenant" before
-- either writes one. This index is what actually prevents the second insert.
--
-- Partial-free: Postgres treats NULLs as distinct in a unique index, so the
-- nullable column is fine as-is. Tenant Zero and any future pre-Clerk tenant
-- keep a NULL owner without colliding.
--
-- Verified zero duplicate non-null owners before writing this.
--
-- The generated diff's plain `Booking_venueId_date_slotIndex_key` line was
-- deleted by hand as always — the live table carries the PARTIAL index
-- `one_live_booking_per_slot`. See schema.prisma's bottom note.

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_ownerClerkUserId_key" ON "Tenant"("ownerClerkUserId");
