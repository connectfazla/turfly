# CLAUDE.md — Turf Booking & Management System

Read this file before writing any code. It is the source of truth for domain rules.
If a request in chat contradicts this file, stop and ask.

---

## 1. What this is

A single Next.js app with two surfaces over one database:

- **Public booking page** — no login. Visitor picks a date, picks a 90-minute slot, submits contact details, gets a booking reference.
- **Admin panel** — `/admin/*`, login required. Two roles: `ADMIN` (owner) and `MODERATOR` (counter staff).

One football field. Open 24 hours. University project — one developer, twelve weeks.

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
6. Max 2 active future bookings per phone number via the public page. Staff may exceed this.
7. Public cancellation allowed up to 6 hours before start. After that, staff only.
8. Blackouts override availability. Warn staff if a blackout would orphan existing bookings.
9. All timestamps stored UTC. Rendered in `Asia/Dhaka`. Currency BDT.

**The partial index** (raw SQL migration — Prisma `@@unique` alone is wrong, it would block re-booking after cancellation):

```sql
CREATE UNIQUE INDEX one_live_booking_per_slot
ON "Booking" (date, "slotIndex")
WHERE status IN ('HELD','CONFIRMED','COMPLETED');
```

---

## 3. Stack

| Concern | Choice |
|---|---|
| Framework | Next.js 15, App Router, TypeScript strict |
| UI | React 19, Tailwind CSS v4, shadcn/ui (Radix) |
| DB | PostgreSQL 16 + Prisma 6 |
| Auth | Auth.js v5, credentials provider, JWT session cookie |
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

Seven entities: `User` (staff only), `Customer` (public, keyed by phone), `Booking`, `SlotRule`, `Blackout`, `Payment`, `AuditLog`.

Customers are **not** Users. They never authenticate.

```
BookingStatus  HELD | CONFIRMED | COMPLETED | CANCELLED | EXPIRED | NO_SHOW
PaymentStatus  UNPAID | PARTIAL | PAID | REFUNDED
BookingSource  ONLINE | COUNTER
Role           ADMIN | MODERATOR
```

Permitted transitions only:
```
—         → HELD        (slot selected, public)
HELD      → CONFIRMED   (form submitted)
HELD      → EXPIRED     (10 min sweep)
—         → CONFIRMED   (counter booking, staff)
CONFIRMED → COMPLETED   (end time passed + checked in)
CONFIRMED → CANCELLED   (public if >6h out; staff any time)
CONFIRMED → NO_SHOW     (staff)
CONFIRMED → CONFIRMED   (reschedule, same row, audited)
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
