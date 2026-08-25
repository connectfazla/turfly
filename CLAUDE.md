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
- **Admin panel** — `/admin/*`, sign-in required. Roles are venue-scoped `OWNER | MANAGER | BOOKIE` — see §11.
- **Platform panel** — `/super-admin/*`, for the platform operator only. Issues the registration codes without which nobody can register a business.

One football field, one venue, open 24 hours, as of the original university project. §11 covers what multi-venue and multi-field change.

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
| Auth | **In-house.** bcrypt + server-side `Session` rows + `VerificationToken` for invite/verify/reset. No third-party identity provider. See `SECURITY.md`. |
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

Seven entities from the original single-venue app: `User` (staff only), `Customer` (public, keyed by phone), `Booking`, `SlotRule`, `Blackout`, `Payment`, `AuditLog`. Four more added by the multi-tenant conversion: `Tenant`, `Venue`, `VenueStaff`, `PlatformAdmin` — see §11. `VenueSetting` (the old single global settings row) no longer exists — its fields live on `Venue` now. One more added by the multi-field/multi-sport conversion: `Field` — see §11.

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

**The marketing surface is the one exception to this section** — `app/page.tsx` and
`components/marketing/*` only. It runs a bigger hero type size (`--text-hero`, 44px,
56px at `lg`), rounder shapes (`--radius-marketing` 20px / 14px), pill buttons, and
white text over a scrimmed photograph. The nine colours are unchanged; nothing new was
added to the palette. The reason for the split: the app is dense and functional, where
§6's restraint is exactly right, while a product landing page whose headline is 30px
and whose corners match a data table reads as unfinished. Those tokens are fenced with
a comment in `globals.css` and must not appear in `/admin`, `/super-admin`, or the
booking flow.

---

## 7. Routes

```
Public    /  /book  /book/[date]  /book/confirm  /book/success/[ref]
          /booking/lookup  /rules  /demo  /booking-not-found
Auth      /sign-in  /sign-up  /verify-email  /forgot-password
          /reset-password  /accept-invite  /onboarding  /select-venue
Staff     /admin  /admin/calendar  /admin/bookings
          /admin/bookings/[id]  /admin/bookings/new
          /admin/blackouts  /admin/customers
Owner     /admin/pricing  /admin/branding  /admin/staff
Owner+Mgr /admin/reports  /admin/audit  /admin/customers
Operator  /super-admin  /super-admin/codes  /super-admin/tenants
```

Every venue is also served at `turfly.xyz/{slug}` — path-based, and the
PRIMARY scheme in production: Cloudflare stays the authoritative nameserver
(no NS delegation, no wildcard cert), which subdomain routing would need.
`middleware.ts` rewrites `/{slug}/...` to the un-prefixed route and stamps
`PATH_VENUE_COOKIE`/`PATH_VENUE_HEADER` (`lib/subdomain.ts`); `{slug}.turfly.xyz`
(`resolveHost`) also still resolves, for any venue that does set up its own
wildcard DNS later. Either way, resolution happens in `lib/request-venue.ts`'s
`getRequestVenue()`, never in middleware itself (no database access there).
The bare domain serves the marketing site and Venue Zero's booking pages.
An unresolvable slug lands on `/booking-not-found`, NOT a thrown
`notFound()` — see that file and `getRequestVenue()`'s doc comments for the
Next.js hydration bug (rewrite + `notFound()`) that forced the workaround.

`/select-venue` is where a staff member with more than one accessible venue
and no `turfly_venue` cookie yet picks one — `/admin`'s layout redirects
there on `VenueNotSelectedError` rather than dead-ending (see §11).

`/book` skips straight to `/book/[date]` for a venue with exactly one active
Field (still nearly every venue); a venue with more than one shows a field
picker first (`components/booking/field-picker.tsx`) — see §11's multi-field
section.

`scripts/verify-role-matrix.ts` checks the role table above against the actual
`requireRole(...)` calls. Run it after touching any guard.

`/login` is a redirect stub to `/sign-in`, kept for old bookmarks.
`/admin/users` is gone; `/admin/staff` replaces it with venue-scoped invitations.

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
- **A test that queries or deletes `Booking` rows by `(date, slotIndex)` alone, without a
  `venueId` filter, is a latent cross-tenant bug in the test itself.** `e2e/concurrency.spec.ts`
  had three such unscoped spots — a `cleanUp()` shared between tests with no venue filter, and two
  `findMany` assertion queries — that worked fine with one venue and silently reached across every
  other tenant's data the moment a second venue existed. Found when `cleanUp()` tried to delete a
  booking belonging to `scripts/create-demo-venue.ts`'s seeded venue, which had a `Payment` row
  (`RESTRICT`, not `CASCADE`) and refused the delete — a lucky loud failure; an unscoped `findMany`
  would have failed silently by miscounting instead. Scope every query in a multi-tenant test by
  the specific venue ids that test created, never by date/slot alone.
- **Reference allocation must happen AFTER the booking insert, not before.** `VenueReferenceCounter` is one row per venue per year, so every concurrent booking for a venue contends on it. Reserving the number first funnels all N racing transactions through that single row lock and they time out (`P2028`) instead of failing cleanly on the slot index; the booking is inserted with a throwaway UUID reference and renamed immediately after, so only the transaction that already won the slot ever touches the counter. Measured at 20-way contention: 1 success / 16 SlotTaken / 3 raw P2028 with the counter first, 1 / 19 / 0 with it last.
- **`tsc --noEmit` passing does NOT mean `next build` will pass.** `next build`'s "Linting and checking validity of types" step also runs ESLint (e.g. `react/no-unescaped-entities` — a bare `'` inside JSX text, not `&apos;`), which `tsc` alone never catches. Before pushing anything that touches JSX text content, run the real `pnpm run build` (matching what Vercel runs) at least once, not just `tsc --noEmit` — a build that only fails on Vercel and not locally wastes a deploy cycle finding out.

---

## 11. Multi-tenant SaaS conversion

**Status:** All 9 original stages shipped, including the venue-picker
(`/select-venue`), owner-uploaded branding (`/admin/branding`), and the
multi-field/multi-sport pass described below. `~/.claude/plans/sprightly-
wobbling-kahn.md` carries the history of each pass's own plan and reasoning.

**Authentication and authorization are both ours.** There is no identity provider.
`requireRole()` resolves a session (`lib/auth/session.ts`), then reads
`Tenant.ownerUserId`, `VenueStaff` and `PlatformAdmin` — all keyed on `User.id`, the one
identity every other FK in the schema already points at. `SECURITY.md` documents what
this protects and, just as importantly, what it does not.

**Roles.** `OWNER | MANAGER | BOOKIE`, scoped to one venue.
- **OWNER** is *derived, never stored* — from `Tenant.ownerUserId`, or a
  `PlatformAdmin` row. That is why `VenueStaffRole` has only MANAGER and BOOKIE.
- **MANAGER** — money and reports, no pricing or staff management.
- **BOOKIE** — bookings and check-in only. Genuinely excluded from money:
  `recordPayment` / `verifyPayment` / `rejectPayment` and the reports export all
  require OWNER or MANAGER.
- **Super Admin** — `PlatformAdmin` table, checked by `requireSuperAdmin()`. A table
  rather than an env var so it is grantable without a redeploy.

**Staff identity.** `User` = one row per human, the FK anchor for
`Booking.createdById` / `AuditLog.actorId` / etc. `VenueStaff` = a grant pointing at
`User.id`. An invited-but-not-accepted staff member has a row and a grant but a NULL
`passwordHash`, and **a null hash can never authenticate** — `verifyPassword` refuses
before comparing. Do not add a code path that treats "no hash" as "no password
required".

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
pnpm exec tsx scripts/verify-onboarding.ts
pnpm exec tsx scripts/verify-role-matrix.ts           # the "staff can't see money" promise
pnpm exec tsx scripts/create-test-venue.ts            # second tenant, for isolation tests
pnpm exec playwright test e2e/concurrency.spec.ts     # both halves of the index guarantee
pnpm exec playwright test e2e/rbac.spec.ts            # real signed-in sessions, own Prisma fixture
```

`e2e/rbac.spec.ts` and `e2e/accessibility-admin.spec.ts` each create a throwaway
Tenant/Venue/User fixture directly via Prisma (known bcrypt password, no external test-instance
setup needed) and sign in through the real `/sign-in` form. `playwright.config.ts` runs `pnpm
start` (the production build) in CI and `pnpm dev` locally — `next dev`'s on-demand route
compilation was racing server-side redirects and surfacing as flaky `net::ERR_ABORTED` navigation
errors when tested against it directly.

First platform admin on a fresh database: sign up at `/sign-up`, then
`pnpm exec tsx scripts/grant-platform-admin.ts you@example.com`.

**Multi-field / multi-sport.** A Venue can have more than one `Field` — two football
pitches and a badminton court is one Venue, three Fields. Each Field gets its own
`SlotRule` price/bookability grid, its own `Booking`s, its own `Blackout`s. Fields
share the ONE system-wide slot grid in `lib/slots.ts` (90-minute slots, 16/day) — a
Field chooses its price and which slots are open, **not** how long a slot is.
Owner-defined slot *duration* per field is an explicit non-goal (see below).

`Field.sportName` is free text ("Football", "Badminton", "Cricket nets") — deliberately
not a constrained enum, so an owner is never blocked by a sport this app's authors
didn't anticipate. Every Venue always has at least one active Field
(`lib/field.ts`'s `getDefaultFieldId()` throws otherwise) — `lib/provisioning.ts`
creates one for every new venue, and `scripts/backfill-fields.ts` did it once for
every venue that predated this pass.

The partial unique index (§2) is keyed on `("venueId", "fieldId", date, "slotIndex")`
— a booking on the football pitch and a booking on the badminton court, same venue,
same date, same slot index, are two independent live bookings, not a collision.
`e2e/concurrency.spec.ts` asserts this as a third property alongside the original two
(one winner within a field; two venues don't block each other).

`fieldId` is threaded explicitly through the public booking flow (a URL/form value,
same shape `date` already has) and through every `lib/booking-engine.ts` write path.
Staff-side surfaces that don't yet have a field switcher (the admin dashboard's day
timeline, `/admin/calendar`, the counter-booking form, blackout creation) default to
the venue's first active field via `getDefaultFieldId()` — a deliberate, documented
gap: a venue with exactly one field (still nearly all of them) sees zero change, and
a venue with more sees its first field until those surfaces grow a picker. Pricing
does NOT get this treatment — `/admin/pricing` has a real field selector, because
silently bulk-pricing every field at once from one form would have been a correctness
bug, not just a missing convenience.

**Not done yet:** owner-defined slot duration per field (explicit non-goal above); a
field switcher on the admin dashboard/calendar/counter-booking form/blackouts (see
above); the wildcard DNS record and Vercel wildcard domain that subdomain routing
would need in production (README documents both) — not currently pursued, since
path-based routing (`turfly.xyz/{slug}`, this section above) needs neither and is
what the product actually links to today.

**Explicit non-goals:** platform billing/Stripe, a real payment gateway, real-time push
notifications, multi-region beyond `Asia/Dhaka`, owner-defined slot duration per field.

**Path-based routing pass** (after the multi-field pass, same session): the DNS the
subdomain scheme needs turned out to require delegating nameservers to Vercel, which
the owner did not want (Cloudflare stays authoritative) — confirmed live by hand,
`demo.turfly.xyz` does not resolve in production at all. `turfly.xyz/{slug}` became
the primary scheme instead (`lib/subdomain.ts`'s `resolvePathSegment`/`venuePathUrl`,
`middleware.ts`'s rewrite, `lib/request-venue.ts`'s three-tier resolution — see §7).
Two real bugs found and fixed by testing against the live production database rather
than trusting the design on paper:

1. `holdSlotAction` (`app/actions/bookings.ts`) used to derive `venueId` from the
   ambient request (host/cookie) at submit time. `PATH_VENUE_COOKIE` is shared across
   every tab on the origin, so a customer with two different venues' booking pages
   open in two tabs could have the second tab's visit silently redirect the first
   tab's hold to the wrong tenant on submit. Fixed by deriving `venueId` from the
   `Field` the customer actually clicked instead (a field belongs to exactly one
   venue, unambiguous) — `lib/booking-engine.ts`'s existing "field belongs to that
   venue" guard would have caught the mismatch and failed safely either way, but this
   makes the hold just work instead of erroring in that edge case.
2. An unresolvable path slug (a typo, an expired venue) calling `notFound()` from a
   page reached via `middleware.ts`'s rewrite hits a genuine Next.js/Turbopack
   hydration bug: the browser's address bar shows `/{slug}` while the actual page
   rendered is `/book`'s, and the client router's reconciliation against that
   mismatch never completes — a permanently blank page, in both `next dev` and a
   production `next build && next start`, no console error. Fixed with a dedicated
   `/booking-not-found` page reached via `redirect()` instead of `notFound()`
   (`getRequestVenue()`'s doc comment has the full mechanism) — and that page had to
   use the marketing header/footer, not `components/site`'s, because THOSE resolve a
   venue too and would inherit the same stale cookie and redirect right back to
   themselves. `PATH_VENUE_HEADER` (set only on the exact request middleware just
   rewrote, never persisted) is what lets a stale `PATH_VENUE_COOKIE` fall through to
   Venue Zero instead of erroring, rather than looping.

The demo venue's own slug moved from `demo` (reserved — it collided with the `/demo`
marketing route once path-based routing made the venue's slug a real URL segment) to
`green-pitch-arena` (`scripts/rename-demo-venue-slug.ts`, `lib/demo.ts`'s
`DEMO_VENUE_SLUG`) — `/demo` now links to it as "the public side" of the demo, so a
prospect can see both the owner dashboard and the actual customer booking page.
