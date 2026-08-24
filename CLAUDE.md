# CLAUDE.md — Turfly

Read this file before writing any code. It is the source of truth for domain rules.
If a request in chat contradicts this file, stop and ask.

---

## 1. What this is

Turfly started as a single-venue university booking app and is being converted into a
multi-tenant SaaS sold to multiple turf owners — see **§11** for the conversion's
current state and the full architecture plan it's built from
(`~/.claude/plans/sprightly-wobbling-kahn.md`).

Sections 2-10 below describe the ORIGINAL single-venue app's rules, which mostly still
hold verbatim — the booking engine, availability logic, and design system are unchanged
in substance. Where the multi-tenant conversion has changed something (e.g. `Venue`
replacing `VenueSetting`), this file has been updated in place; §11 is where genuinely
NEW concepts (Tenant, VenueStaff, Super Admin) are documented rather than retrofitted
into the numbered sections written for the single-venue app.

A single Next.js app with two surfaces over one database:

- **Public booking page** — no login. Visitor picks a date, picks a 90-minute slot, submits contact details, gets a booking reference.
- **Admin panel** — `/admin/*`, login required. Two roles: `ADMIN` (owner) and `MODERATOR` (counter staff). Being superseded by a venue-scoped dashboard + Clerk-based Owner/Manager/Bookie roles — see §11.

One football field, one venue, open 24 hours, as of the original university project. §11 covers what multi-venue changes.

---

## 2. Domain invariants — never violate these

```
SLOT_MINUTES   = 90
SLOTS_PER_DAY  = 16          // 1440 / 90, exact
MAINTENANCE    = 4           // 06:00–07:30, never bookable, any day
BOOKABLE/DAY   = 15
```

1. A slot is an **integer 0–15**, never a timestamp pair. `slotStart = startOfDay(date) + index * 90min`.
2. Slot index 4 is never bookable on any date. This lives in `SlotRule` seed data, not in an `if`.
3. At most **one live booking** per `(date, slotIndex)`. Enforced by a *partial* unique index, not by application logic.
4. A slot whose start time has passed cannot be booked.
5. Selecting a slot creates a `HELD` row expiring in 10 minutes. Expired holds are swept inside the create transaction.
6. Max 2 active future bookings per phone number via the public page (CONFIRMED + PENDING_VERIFICATION both count). Staff may exceed this.
7. Public cancellation allowed up to 6 hours before start. After that, staff only.
8. Blackouts override availability. Warn staff if a blackout would orphan existing bookings.
9. All timestamps stored UTC. Rendered in `Asia/Dhaka`. Currency BDT.
10. **A public online booking is never CONFIRMED on submission.** Submitting the confirm form (email, address, bKash deposit TRXN) moves HELD -> PENDING_VERIFICATION, which occupies the slot exclusively same as HELD/CONFIRMED/COMPLETED. Only a staff member verifying the TRXN moves it to CONFIRMED. An unverified claim auto-expires after `Venue.paymentVerificationHours` (default 24h, was `VenueSetting.paymentVerificationHours` before §11) so a fake/abandoned TRXN can't lock a slot forever. Counter bookings (staff, in person) skip this — they go straight to CONFIRMED, since staff already have the money or a bKash notification in hand. The deposit itself is `Venue.depositPercent`% of the booking's price (was a fixed `VenueSetting.advanceAmount` BDT figure before §11) — see §11.

**The partial index** (raw SQL migration — Prisma `@@unique` alone is wrong, it would block re-booking after cancellation):

```sql
CREATE UNIQUE INDEX one_live_booking_per_slot
ON "Booking" (date, "slotIndex")
WHERE status IN ('HELD','CONFIRMED','COMPLETED','PENDING_VERIFICATION');
```

---

## 3. Stack

| Concern | Choice |
|---|---|
| Framework | Next.js 15, App Router, TypeScript strict |
| UI | React 19, Tailwind CSS v4, shadcn/ui (Radix) |
| DB | PostgreSQL 16 + Prisma 6 |
| Auth | Auth.js v5 (staff/admin, legacy — being replaced by Clerk Organizations, §11) + Clerk (tenant/customer layer, and eventually Owner/Manager/Bookie) |
| Validation | Zod — one schema shared by client form and server action |
| Forms | React Hook Form |
| Dates | date-fns + date-fns-tz |
| Email | Resend + React Email |
| Charts | Recharts |
| Tests | Vitest, Testing Library, Playwright |
| Hosting | Vercel + Neon |

---

## 4. Architecture rules

- **Mutations are Server Actions.** Do not hand-write POST route handlers for booking operations.
- **Reads for first paint are Server Components.** No client fetch waterfall on `/book`.
- `lib/slots.ts` and `lib/availability.ts` are **pure** — they import nothing from `next`, `react` or `@prisma/client`. Plain values in, plain values out. This is what makes correctness unit-testable.
- Every Server Action does, in this order: `zodSchema.parse()` → role check → domain call → audit write.
- Availability is computed by **one function**, used by public page, admin panel and the JSON API. Never a second implementation.
- Notifications are a side effect **outside** the booking transaction. Email failure must never roll back a booking.

---

## 5. Data model

Seven entities from the original single-venue app: `User` (staff only), `Customer` (public, keyed by phone), `Booking`, `SlotRule`, `Blackout`, `Payment`, `AuditLog`. Four more added by the multi-tenant conversion: `Tenant`, `Venue`, `VenueStaff`, `PlatformAdmin` — see §11. `VenueSetting` (the old single global settings row) no longer exists — its fields live on `Venue` now.

Customers are **not** Users. They never authenticate. Customer stays global (not venue-scoped) even after §11's conversion — see §11's tenancy section for why.

```
BookingStatus       HELD | PENDING_VERIFICATION | CONFIRMED | COMPLETED | CANCELLED | EXPIRED | NO_SHOW
PaymentStatus        UNPAID | PARTIAL | PAID | REFUNDED
PaymentClaimStatus   PENDING | VERIFIED | REJECTED    // per Payment row, not per Booking
BookingSource         ONLINE | COUNTER
Role                  ADMIN | MODERATOR
```

Permitted transitions only:
```
—                     → HELD                    (slot selected, public)
HELD                  → PENDING_VERIFICATION     (confirm form submitted: email, address, bKash TRXN)
HELD                  → EXPIRED                  (10 min sweep)
PENDING_VERIFICATION  → CONFIRMED                 (staff verifies the TRXN)
PENDING_VERIFICATION  → CANCELLED                 (staff rejects the TRXN)
PENDING_VERIFICATION  → EXPIRED                   (paymentVerificationHours sweep, default 24h)
—                     → CONFIRMED                 (counter booking, staff — money already in hand)
CONFIRMED             → COMPLETED                 (end time passed + checked in)
CONFIRMED             → CANCELLED                 (public if >6h out; staff any time)
CONFIRMED             → NO_SHOW                   (staff)
CONFIRMED             → CONFIRMED                 (reschedule, same row, audited)
```
Anything else: reject in the domain layer.

See `prisma/schema.prisma` for the full schema.

---

## 6. Design system — do not improvise

Nine colours, one accent. Anything not listed does not appear in the UI.

```
surface        #FFFFFF   page background
surface-muted  #F9FAFB   cards, table headers, disabled slots
border         #E5E7EB   all hairlines and input outlines
text           #111827   headings, primary text
text-muted     #6B7280   labels, captions, helper text
accent         #15803D   primary buttons, available slots, confirmations
accent-soft    #DCFCE7   available-slot fill, success banners
warning        #B45309   maintenance, blackouts, expiring holds
danger         #B91C1C   destructive actions, validation errors
```

Type scale (Inter via `next/font`, tabular figures for times and money):
`30/700 display · 20/600 heading · 16/600 subheading · 14/400 body · 12/400 caption`

- Spacing: multiples of 4px only. 8 / 16 / 24 do most of the work.
- Radius 8px (6px on full-width inputs). Exactly one shadow level, dialogs and popovers only.
- Max content width 1120px. Booking grid centred, never full-bleed.
- **One primary action per screen.**
- Touch targets ≥ 44×44pt.
- **State is never colour-only.** A booked slot also reads "Booked".
- WCAG 2.1 AA contrast. Visible focus ring, never removed.
- Every list needs a designed empty state.

Slot grid: 4 columns desktop, 2 tablet, 1 phone. Render all 16 positions always — the day must look the same shape whatever is booked.

---

## 7. Routes

```
Public   /  /book  /book/[date]  /book/confirm  /book/success/[ref]
         /booking/lookup  /rules
Staff    /login  /admin  /admin/calendar  /admin/bookings
         /admin/bookings/[id]  /admin/bookings/new
         /admin/blackouts  /admin/customers
Admin    /admin/pricing  /admin/reports  /admin/users  /admin/audit
```

Middleware guards `/admin/*`. The four Admin-only routes additionally require `role === 'ADMIN'`.
**Re-check the role inside every action** — middleware alone is not authorisation.

---

## 8. Conventions

- `pnpm` for packages. `pnpm dlx shadcn@latest add <c>` for components, then restyle to the tokens above.
- Booking reference format: `TRF-YYYY-NNNN`, sequential per year, generated inside the transaction.
- Server Actions live in `app/actions/`, one file per domain area.
- No `dangerouslySetInnerHTML`. Anywhere.
- No secrets in code. Env vars only:
  `DATABASE_URL AUTH_SECRET AUTH_URL RESEND_API_KEY SMS_API_KEY NOTIFICATIONS_ENABLED HOLD_MINUTES=10 CANCELLATION_WINDOW_HOURS=6 BOOKING_WINDOW_DAYS=14 TZ=Asia/Dhaka`
- Commits: conventional (`feat:`, `fix:`, `test:`, `chore:`).

## 9. Definition of done for any task

- [ ] `tsc --noEmit` clean in strict mode
- [ ] Unit tests for any pure function touched
- [ ] Zod validation on any new action or route handler
- [ ] Role check inside the action, not only in middleware
- [ ] Audit row written for any mutation
- [ ] Keyboard reachable, visible focus, accessible name on interactive elements
- [ ] No new colour, font size or spacing value outside §6

---

## 10. Known traps

- **Slot 15 ends at 00:00 the next day.** Label it `22:30 – 00:00`, not `22:30 – 24:00`. Write the test.
- **`date` is a calendar day** (`@db.Date`), not a timestamp. Never compare it with `new Date()` directly.
- Prisma unique-violation is error code **`P2002`** — catch it and return "That slot was just booked by someone else," never a 500.
- Order of checks in availability matters: maintenance → blackout → booked → past → rule. Getting this wrong makes the 06:00 slot read as merely "blocked", and makes completed late-night bookings read as "past".
- Serialisable transactions can abort under contention. Retry once before surfacing an error.
- **`DATABASE_URL` must be Neon's DIRECT (non-`-pooler`) connection string, not the pooled one.** Neon's `-pooler` endpoint runs PgBouncer in transaction-pooling mode, which does not reliably support Prisma's interactive `$transaction()` API — every write in `lib/booking-engine.ts` uses it (`runSerializable`). Using the pooled URL fails with `P2028: Transaction not found`, non-deterministically, at whichever query happens to be in flight when the pool reassigns the connection. Confirmed by reproducing outside Next.js entirely. Separately, `runSerializable`'s transaction `timeout`/`maxWait` were widened (15s/5s, was Prisma's 5s/2s default) because this Neon compute's per-query round-trip latency, multiplied across `holdSlot`'s ~8 sequential queries, was already close to the default budget even on the direct connection.

---

## 11. Multi-tenant SaaS conversion

**Status:** Phase 0 complete (schema + tenancy plumbing, zero user-facing behavior
change — see the phase list below). Phases 1-6 not started. Full architecture,
reasoning, and file-by-file phase breakdown: `~/.claude/plans/sprightly-wobbling-kahn.md`
— read that file before starting Phase 1 or later; this section is a summary, not a
replacement for it.

**Why:** the university single-venue app is being turned into Turfly, a product sold to
multiple turf owners, each potentially running several physical venues, each with their
own staff. §1-10 above describe the domain rules of the original app, which mostly
still hold — this section only covers what's NEW or CHANGED.

**New role model** (replaces/extends `Role: ADMIN | MODERATOR`, which still exists for
the one legacy venue through Phase 2):
- **Super Admin** — the platform operator (one person today). Checked via a
  `PlatformAdmin` DB table (Clerk user id), not the Role enum.
- **Owner** — a Turf Owner. Not a `VenueStaff` row — derived from Clerk Organization
  membership (`org:admin` role on the venue's `Tenant`). Full access to every `Venue`
  under their `Tenant`.
- **Manager** — `VenueStaff.role = MANAGER`. Venue-scoped. Confirms bookings, verifies
  payment claims, walk-in bookings, sees that venue's revenue/reports. Cannot manage
  staff or pricing.
- **Bookie** — `VenueStaff.role = BOOKIE`. Venue-scoped. Booking + check-in only — no
  financial visibility.
- **Customer** — unauthenticated by default (phone-only, as in the original app) or an
  optional Clerk personal account (`Customer.clerkUserId`) for a cross-venue "my
  bookings" view. Never a `VenueStaff` row, never a `Tenant` owner.

**Tenancy model:** one Clerk Organization = one `Tenant` = one Turf Owner's business.
One `Tenant` can have several `Venue` rows (multi-venue support). `VenueStaff` exists
specifically because Clerk Organization roles are org-wide, not scoped to one venue
within a multi-venue tenant — see the plan file's "Auth & Tenancy Architecture" section
for the full reasoning, including the multi-org caveat (a person could be staff at
venues under two different tenants/orgs and must switch Clerk's active org).

**"Tenant Zero" / "Venue Zero":** the one venue that existed before any real Turf Owner
signed up through the new onboarding flow. `Tenant.clerkOrgId` is nullable specifically
because Tenant Zero has no Clerk Organization. Resolved via `lib/tenant.ts`'s
`getDefaultVenueId()` (slug `"default"`) — every Phase 0 call site that needs a venue
but doesn't yet have a real per-request one falls back to this, which is why Phase 0 is
a genuine zero-behavior-change pass despite touching most of the codebase.

**Schema changes already live** (Phase 0): `Tenant`, `Venue`, `VenueStaffRole` enum,
`VenueStaff`, `PlatformAdmin` are new. `Booking`/`SlotRule`/`Blackout`/`Payment` gained
a **nullable** `venueId` (`Booking`/`AuditLog` also gained a nullable `tenantId`) —
nullable deliberately: the partial unique index on `Booking` is still keyed on
`(date, slotIndex)` only, NOT `(venueId, date, slotIndex)`, and stays that way until a
later phase makes `venueId` `NOT NULL` and widens the index in the same migration.
`VenueSetting` is gone; its fields moved onto `Venue`. `Venue.depositPercent` (default
30) replaces the old fixed `VenueSetting.advanceAmount` — `Booking`/`Payment` amounts
owed are computed as a percentage of price, not a flat BDT figure, everywhere this
matters (`lib/booking-engine.ts`'s `confirmHeldBooking`, `components/booking/confirm-form.tsx`,
`components/admin/payment-settings-form.tsx`).

**Booking reference format is unchanged for now** (`TRF-YYYY-NNNN`) — the plan
specifies it becomes `TRF-{venueCode}-YYYY-NNNN` with a per-venue-scoped counter in a
later phase, once `lib/booking-engine.ts`'s `nextReference()` is made venue-aware. Not
done yet; the counter is still a single global sequence.

**Not started yet** (see the plan file for the full phase list): owner onboarding /
venue provisioning, Clerk-based staff invites, `require-venue-role.ts`, venue-scoped
`/dashboard/[venueId]/...` routes, `{venueSlug}.turfly.<tld>` subdomain-per-venue public booking URLs (updated from an earlier path-based `/v/[venueSlug]/...` design — see the plan file's Routing Structure section),
`/super-admin/*`, per-venue email branding. Explicit non-goals (deferred, not
forgotten): platform billing/Stripe, a real payment gateway, subdomain-per-venue custom
domains, real-time push notifications, multi-region/timezone support beyond
`Asia/Dhaka`.
