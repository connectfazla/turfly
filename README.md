# Greenfield Turf — Booking & Management System

A single Next.js 15 app with two surfaces over one PostgreSQL database:

- **Public booking page** — no login. Pick a date, pick a 90-minute slot, submit contact
  details, get a booking reference.
- **Admin panel** (`/admin/*`) — login required. Two roles: `ADMIN` (owner) and `MODERATOR`
  (counter staff).

One football field, open 24 hours. See [`CLAUDE.md`](./CLAUDE.md) for the full domain spec and
[`BUILD_PLAN.md`](./BUILD_PLAN.md) for the build order this was implemented in.

## Stack

Next.js 15 (App Router, TypeScript strict) · React 19 · Tailwind CSS v4 · shadcn/ui (Radix) ·
PostgreSQL 16 + Prisma 6 · Auth.js v5 (credentials, JWT sessions) · Zod · React Hook Form ·
date-fns / date-fns-tz · Resend + React Email · Recharts · Vitest + Testing Library + Playwright.

## The correctness core

Double-booking is prevented at the database level, not by application logic: a **partial unique
index** on `Booking (date, slotIndex) WHERE status IN ('HELD','CONFIRMED','COMPLETED')`. Every
write path sweeps expired holds and asserts availability inside a Serializable transaction before
writing, and retries once on a genuine write conflict.

`lib/slots.ts` and `lib/availability.ts` are pure — no `next`, `react`, or `@prisma/client`
imports — so the slot arithmetic and availability rules are exhaustively unit-tested (100%
coverage, `pnpm test:coverage`). `e2e/concurrency.spec.ts` fires 20 simultaneous booking attempts
at the same slot against a real, unmocked Postgres and asserts exactly one wins.

## Getting started

Requires Node 20.19+/22.12+/24+, pnpm, and a local PostgreSQL 16 (a `docker-compose.yml` is
included; a native install works just as well).

```bash
cp .env.example .env        # fill in DATABASE_URL, AUTH_SECRET (pnpm dlx auth secret), etc.
docker compose up -d        # or point DATABASE_URL at your own Postgres
pnpm install
pnpm prisma migrate deploy  # applies the partial-index migration as-is — do not regenerate it
pnpm db:seed                # 112 SlotRule rows, one ADMIN + one MODERATOR user, VenueSetting
pnpm dev
```

Seeded staff logins (override with `SEED_ADMIN_PASSWORD` / `SEED_MODERATOR_PASSWORD` before
seeding a real environment):

| Email | Password | Role |
|---|---|---|
| `admin@turf.local` | `Admin123!` | ADMIN |
| `moderator@turf.local` | `Moderator123!` | MODERATOR |

## Scripts

```bash
pnpm dev              # dev server (Turbopack)
pnpm build / start    # production build / serve
pnpm typecheck        # tsc --noEmit, strict
pnpm lint             # eslint
pnpm format           # prettier --write
pnpm test             # vitest (lib/slots.ts, lib/availability.ts)
pnpm test:coverage    # same, with the 100% coverage gate
pnpm e2e              # playwright: concurrency, RBAC, axe accessibility (public + admin)
pnpm prisma:studio    # inspect the database
```

`pnpm e2e` starts its own dev server (`playwright.config.ts`) and needs `DATABASE_URL` pointed at
a real, migrated, seeded database — it does not mock anything.

## Project layout

```
lib/slots.ts               pure slot arithmetic — the 90-minute grid, the slot-15 label trap
lib/availability.ts        pure: the ONE function that decides a slot's state
lib/availability-service.ts   fetches DB rows, calls the pure function — used everywhere
lib/booking-engine.ts      the only file allowed to mutate Booking — transactions, audit, errors
lib/notifications/         Notifier interface: Resend / Console (dev) / Noop
lib/schemas/                Zod schemas shared by client forms and Server Actions
app/actions/                Server Actions, one file per domain area
app/(public routes)         /  /book  /book/[date]  /book/confirm  /book/success/[ref]  ...
app/admin/                  the staff panel, gated by middleware.ts + lib/auth/require-role.ts
e2e/                        concurrency proof, RBAC, axe accessibility (public + admin)
```

## Deployment

Not deployed by this session — see [`DEPLOYMENT.md`](./DEPLOYMENT.md) for the Vercel + Neon steps
and the environment variables a production deploy needs.

## CI

`.github/workflows/ci.yml`: typecheck → lint → unit tests (coverage-gated) → build → Playwright
against a real Postgres service container → Lighthouse + a second axe pass, with score
thresholds (`lighthouserc.json`).
