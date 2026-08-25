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
- **Admin panel** — `/admin/*`, Clerk sign-in required. Roles are venue-scoped `OWNER | MANAGER | BOOKIE` — see §11.
- **Platform panel** — `/super-admin/*`, for the platform operator only. Issues the registration codes without which nobody can register a business.

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
ON "Booking" ("venueId", date, "slotIndex")
WHERE status IN ('HELD','CONFIRMED','COMPLETED','PENDING_VERIFICATION');
```

Venue-scoped since Migration B. Both halves are load-bearing and pull in opposite
directions: drop `venueId` and one turf's booking blocks an unrelated business's;
drop the `WHERE` and a cancelled slot can never be rebooked. `e2e/concurrency.spec.ts`
asserts both.

---

## 3. Stack

| Concern | Choice |
|---|---|
| Framework | Next.js 15, App Router, TypeScript strict |
| UI | React 19, Tailwind CSS v4, shadcn/ui (Radix) |
| DB | PostgreSQL 16 + Prisma 6 |
| Auth | Clerk (`@clerk/nextjs`) for everyone — staff, owners, operator, optional customer accounts. Auth.js is GONE. |
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
Public    /  /book  /book/[date]  /book/confirm  /book/success/[ref]
          /booking/lookup  /rules  /sign-in  /sign-up
Staff     /admin  /admin/calendar  /admin/bookings
          /admin/bookings/[id]  /admin/bookings/new
          /admin/blackouts  /admin/customers
Owner     /admin/pricing  /admin/reports  /admin/audit
Operator  /super-admin  /super-admin/codes  /super-admin/tenants
```

`/login` is a redirect stub to `/sign-in`, kept for old bookmarks. `/admin/users` is
gone — it was password-based; venue-scoped Clerk invitations replace it.

Middleware ONLY checks that somebody is signed in. It does no role check and reads no
database — a role now comes from `Tenant`/`VenueStaff`/`PlatformAdmin` rows, which is
a query that does not belong in middleware. **The real gate is `requireRole()` inside
every page and action** (`requireSuperAdmin()` for `/super-admin/*`). A layout does not
protect a Server Action.

---

## 8. Conventions

- `pnpm` for packages. `pnpm dlx shadcn@latest add <c>` for components, then restyle to the tokens above.
- Booking reference format: `TRF-{venueCode}-YYYY-NNNN`, sequential per venue per year, from `VenueReferenceCounter`, assigned inside the transaction but AFTER the booking insert (see §10). Legacy `TRF-YYYY-NNNN` references still resolve and must keep doing so.
- Server Actions live in `app/actions/`, one file per domain area.
- No `dangerouslySetInnerHTML`. Anywhere.
- No secrets in code. Env vars only:
  `DATABASE_URL NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY CLERK_SECRET_KEY RESEND_API_KEY SMS_API_KEY NOTIFICATIONS_ENABLED TZ=Asia/Dhaka`
  `HOLD_MINUTES` / `CANCELLATION_WINDOW_HOURS` / `BOOKING_WINDOW_DAYS` are now per-venue columns on `Venue`; the env vars survive only as fallbacks for provisioning defaults.
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
- **Reference allocation must happen AFTER the booking insert, not before.** `VenueReferenceCounter` is one row per venue per year, so every concurrent booking for a venue contends on it. Reserving the number first funnels all N racing transactions through that single row lock and they time out (`P2028`) instead of failing cleanly on the slot index; the booking is inserted with a throwaway UUID reference and renamed immediately after, so only the transaction that already won the slot ever touches the counter. Measured at 20-way contention: 1 success / 16 SlotTaken / 3 raw P2028 with the counter first, 1 / 19 / 0 with it last.
- **`tsc --noEmit` passing does NOT mean `next build` will pass.** `next build`'s "Linting and checking validity of types" step also runs ESLint (e.g. `react/no-unescaped-entities` — a bare `'` inside JSX text, not `&apos;`), which `tsc` alone never catches. Before pushing anything that touches JSX text content, run the real `pnpm run build` (matching what Vercel runs) at least once, not just `tsc --noEmit` — a build that only fails on Vercel and not locally wastes a deploy cycle finding out.

---

## 11. Multi-tenant SaaS conversion

**Status:** Stages 1-4 and 6 shipped. Full plan, reasoning, and remaining stages:
`~/.claude/plans/sprightly-wobbling-kahn.md` — read it before starting a new stage.

**THE CENTRAL RULE: our database is the authorization source of truth; Clerk is
authentication only.** `requireRole()` never reads Clerk's `orgId`/`orgRole` — it reads
`Tenant.ownerClerkUserId`, `VenueStaff`, and `PlatformAdmin`. This is deliberate: a
lagging webhook, a failed organization creation, or an unset active org can never lock
an owner out of their own dashboard. Clerk Organizations matter only for hosted staff
invitations (Stage 8), which is why everything below works with Organizations not even
enabled on the instance.

**Roles.** `OWNER | MANAGER | BOOKIE`, scoped to one venue.
- **OWNER** is *derived, never stored* — from `Tenant.ownerClerkUserId`, or a
  `PlatformAdmin` row. That is why `VenueStaffRole` has only MANAGER and BOOKIE.
- **MANAGER** — money and reports, no pricing or staff management.
- **BOOKIE** — bookings and check-in only. Genuinely excluded from money:
  `recordPayment` / `verifyPayment` / `rejectPayment` and the reports export all
  require OWNER or MANAGER.
- **Super Admin** — `PlatformAdmin` table, checked by `requireSuperAdmin()`. A table
  rather than an env var so it is grantable without a redeploy.

**Staff identity.** `User` = one row per human, the FK anchor for
`Booking.createdById` / `AuditLog.actorId` / etc., bound to a Clerk account via
`clerkUserId`. `VenueStaff` = a grant, pointing at `User.id`. Keeping the local row is
what lets an old audit entry still render "who did this" after a Clerk account is
deleted.

**Binding is security-critical** (`resolveStaffUser()` in `lib/auth/require-role.ts`).
A Clerk account binds to a `User` row ONLY when Clerk reports the email **verified**,
it matches `User.invitedEmail` (NOT `User.email`, which is editable for display), and
the row is unbound — claimed via `updateMany` so two concurrent first sign-ins cannot
both take it. Do not relax any of the three.

**Active venue** (`lib/auth/active-venue.ts`): explicit param > cookie > sole venue.
None of them are trusted — every one is re-derived against real grants before use.
Prefer `requireRoleForVenue(venueId, ...)` wherever the venue is known; the cookie is
shared across browser tabs, so a mutation from an older tab can otherwise land on
whichever venue was opened last.

**Registration codes** (`lib/registration-code.ts`). Nobody can create a `Tenant`
without redeeming one — this is what makes the platform invite-only. Two-phase:
`redeemedAt` = claimed, `tenantId` = completed. The gap lets a half-finished signup
resume instead of burning the code. The one-time guarantee comes from `updateMany`'s
WHERE clause under READ COMMITTED, NOT a transaction — a concurrent identical UPDATE
blocks on the row lock, re-evaluates its WHERE against the updated row, and matches
zero rows. Verified by `scripts/verify-registration-codes.ts` (11 checks, including
two genuinely concurrent redemptions).

**Verification scripts** — run these after touching auth or tenancy:
```
pnpm exec tsx scripts/verify-tenant-isolation.ts
pnpm exec tsx scripts/verify-registration-codes.ts
pnpm exec tsx scripts/create-test-venue.ts            # second tenant, for isolation tests
pnpm exec playwright test e2e/concurrency.spec.ts     # both halves of the index guarantee
```

**Not done yet:** subdomain routing (`{slug}.turfly.tld`), owner onboarding /
provisioning (Stage 7), staff invitations + `/dashboard/[venueId]` (Stage 8), dropping
the legacy `User.passwordHash` / `User.role` columns (Stage 9). Clerk **Organizations
is not yet enabled** on the instance — needed only for Stage 8, and must be enabled
with membership mode `optional`, since customers must be able to exist with no org.

**Explicit non-goals:** platform billing/Stripe, a real payment gateway, real-time push
notifications, multi-region beyond `Asia/Dhaka`.
