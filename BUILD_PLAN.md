# Build Plan — paste these into Claude Code in order

Each step is one session. Don't skip ahead: steps 3–5 are the correctness core, and everything after them is interface work that assumes they're right.

Start every session with `/init` already done and `CLAUDE.md` in the repo root.

---

## Step 0 — Scaffold

> Scaffold a Next.js 15 app with TypeScript strict, Tailwind v4, ESLint and Prettier, using pnpm. Add Prisma with a PostgreSQL datasource, Auth.js v5, Zod, React Hook Form, date-fns and date-fns-tz. Set up Vitest and Playwright. Create a docker-compose.yml with a local Postgres. Add the design tokens from CLAUDE.md §6 to the Tailwind theme. Don't build any features yet — I want a clean skeleton that typechecks and runs.

**Done when:** `pnpm dev` serves a blank page, `pnpm typecheck` is clean, local Postgres is reachable.

---

## Step 1 — Schema and seed

> Implement `prisma/schema.prisma` exactly as given in the repo. Then write a raw SQL migration that creates the partial unique index from CLAUDE.md §2 — the Prisma `@@unique` is not sufficient and you must add the `WHERE status IN (...)` clause by hand. Then write `prisma/seed.ts` that seeds: 112 SlotRule rows (7 days × 16 slots) with `slotIndex === 4` marked `isBookable: false` on every day, one ADMIN user, one MODERATOR user, and default pricing.

**Done when:** `pnpm prisma migrate dev` succeeds and `psql \d "Booking"` shows the partial index with its WHERE clause. **Verify that by eye — it is the single most important line in the project.**

---

## Step 2 — Pure slot logic

> Implement `lib/slots.ts` from the file in this repo, then `lib/availability.ts` with `getDayAvailability(date)`. Both must import nothing from next, react or @prisma/client — take data as arguments and return plain values. Then write exhaustive Vitest tests: slot 15 labels as "22:30 – 00:00", slot 4 is never bookable on any weekday, a past slot today is excluded but the same index tomorrow is not, a blackout with null slotIndex closes all 16, and the check order from CLAUDE.md §10 is respected.

**Done when:** tests pass and coverage of these two files is 100%. This is your viva evidence — keep the test output.

---

## Step 3 — Booking engine ⚠️ the hard part

> Implement `lib/booking-engine.ts` with `holdSlot`, `createBooking`, `cancelBooking`, `rescheduleBooking`. `createBooking` runs in a Serializable transaction that: sweeps expired holds, asserts bookability, upserts the Customer by phone, enforces the 2-active-booking limit, generates the TRF-YYYY-NNNN reference, creates the row, and writes an audit entry. Catch Prisma P2002 and throw a typed `SlotTakenError` with a human message. Retry once on a serialisation failure before surfacing an error.

Then, separately:

> Write a Playwright test that fires 20 simultaneous createBooking requests at the same slot. Assert exactly 1 succeeds and 19 return SlotTakenError. Do not mock the database.

**Done when:** that test is green. **Record the terminal output — run this test live in your demo.** It's the most convincing thirty seconds of the whole presentation.

---

## Step 4 — Public booking flow

> Build `/book` as a Server Component rendering DateStrip (14 days, free-slot counts) and SlotGrid (all 16 positions, 4/2/1 columns). SlotCard has four states — available, booked, blocked, past — each with a text label, not just colour, and an accessible name like "Book 19:30 to 21:00, 480 taka, available". Poll `/api/availability?date=` every 30 seconds. Then `/book/confirm` with the booking form (name, phone, optional email, team name, note), a visible HoldTimer counting down from 10 minutes, and `/book/success/[ref]`.

Then:

> Add `/booking/lookup` — retrieve by reference + phone, with cancellation if the slot is more than 6 hours away. Return one generic message on failure; do not reveal whether the reference exists.

**Done when:** you can book on your phone in under 90 seconds.

---

## Step 5 — Auth and RBAC

> Wire Auth.js v5 credentials provider with bcrypt cost 12. Session in an HTTP-only Secure SameSite=Lax cookie, 8 hour expiry. Add middleware guarding `/admin/*` and requiring ADMIN on `/admin/pricing`, `/admin/reports`, `/admin/users`, `/admin/audit`. Then add a `requireRole()` helper and call it inside every staff Server Action — middleware is not authorisation. Rate-limit login to 10 attempts per 15 minutes per IP.

Then:

> Write a Playwright test asserting a MODERATOR session is refused all nine ADMIN-only actions, both by direct URL and by calling the action directly.

---

## Step 6 — Admin panel

Split across two or three sessions.

> Build `/admin` as a 16-row DayTimeline: current slot highlighted, each row showing customer, phone, payment status, and a one-tap check-in. Then `/admin/bookings` with a searchable filterable DataTable (reference, phone, name, date range, status) and `/admin/bookings/[id]` for amend, cancel, reschedule, record payment, internal notes. Every destructive action goes through ConfirmDialog restating the affected booking.

> Build `/admin/bookings/new` (counter booking with optional price override), `/admin/blackouts` (slot or whole day, with a warning listing existing bookings that would be affected), and `/admin/customers` (history, totals, no-show count, block/unblock).

---

## Step 7 — Config, reports, notifications

> Build `/admin/pricing` (standard, peak, weekend), `/admin/users` (create, disable, change role), `/admin/audit` (read-only log with actor and diff). Then `/admin/reports`: daily summary, revenue by day/week/month with prior-period comparison, and a utilisation heat map of slot index against day of week using Recharts. Add CSV export for any date range.

> Add a `Notifier` interface with ResendNotifier, ConsoleNotifier (dev) and NoopNotifier (when NOTIFICATIONS_ENABLED=false). Send confirmation, cancellation and reschedule emails. Calls happen after the transaction commits, are retried twice with backoff, and can never roll back a booking.

---

## Step 8 — Harden and ship

> Run an axe-core accessibility pass over every public route and fix all critical violations. Add a GitHub Actions workflow: typecheck, lint, unit + integration tests with a coverage gate on lib/, build, Playwright against the preview, then Lighthouse and axe with thresholds. Deploy to Vercel with a Neon database and run migrations before traffic cutover.

---

## Demo script for your professor

Twelve minutes, in this order:

1. **Book a slot on your phone**, projected. Under 90 seconds, no login. (Objectives O1, O2)
2. **Run the concurrency test live.** 20 requests, 1 wins. Explain the partial unique index. (O3) ← *lead with this if you only get five minutes*
3. **Log in as Moderator.** Try `/admin/pricing`. Get refused. (O5)
4. **Log in as Admin.** Create a blackout on tomorrow's 19:30. Refresh the public page — it's gone. (O6)
5. **Show the utilisation heat map.** Point at the dead 03:00 slot and say what you'd price it at. (O7)
6. **Show `lib/slots.ts`** and its 100% test coverage. Explain why it imports nothing.

The point to land: *correctness is enforced by the database, not by hope.*
