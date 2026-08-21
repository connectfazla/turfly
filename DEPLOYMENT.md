# Deployment — Vercel + Neon

This app targets Vercel (hosting) + Neon (managed Postgres), per `CLAUDE.md` §3. It has not been
deployed by this session — that requires your own Vercel/Neon accounts and credentials. These are
the steps.

## 1. Provision Neon

1. Create a project at [neon.tech](https://neon.tech). Note the pooled connection string
   (`...pooler.neon.tech...`) — use the **pooled** one for `DATABASE_URL` since Vercel's
   serverless functions open many short-lived connections.
2. Neon's default `sslmode=require` is fine; Prisma handles it automatically.

## 2. Environment variables

Set these in the Vercel project (Settings → Environment Variables), for both Preview and
Production:

| Variable | Notes |
|---|---|
| `DATABASE_URL` | Neon's pooled connection string |
| `AUTH_SECRET` | Generate with `openssl rand -base64 32` — a fresh one, never reused from `.env` |
| `AUTH_URL` | your production URL, e.g. `https://greenfieldturf.example.com` |
| `RESEND_API_KEY` | from resend.com, once you own the sending domain |
| `SMS_API_KEY` | reserved — no SMS provider is wired up yet (see `lib/notifications/`) |
| `NOTIFICATIONS_ENABLED` | `true` in production |
| `HOLD_MINUTES` | `10` |
| `CANCELLATION_WINDOW_HOURS` | `6` |
| `BOOKING_WINDOW_DAYS` | `14` |
| `TZ` | `Asia/Dhaka` — the whole app assumes this; do not change without re-reading `lib/slots.ts` |

## 3. Migrate before traffic cutover

Run this against the **production** `DATABASE_URL` before the first deploy serves real traffic,
and before every deploy that changes `prisma/schema.prisma`:

```bash
DATABASE_URL="<neon-pooled-url>" pnpm prisma migrate deploy
```

`migrate deploy` applies migrations as committed — it will **not** regenerate the partial unique
index migration, which is exactly what you want; that migration's SQL was hand-edited (see the
note at the bottom of `prisma/schema.prisma`) and must never be replaced by a fresh
`prisma migrate dev` diff.

Then seed once, for the first environment only (seeding is idempotent but reseeding with default
passwords in a live environment is a bad idea — set `SEED_ADMIN_PASSWORD` /
`SEED_MODERATOR_PASSWORD` first):

```bash
SEED_ADMIN_PASSWORD="<a real password>" SEED_MODERATOR_PASSWORD="<a real password>" \
  DATABASE_URL="<neon-pooled-url>" pnpm db:seed
```

Immediately change both seeded passwords from `/admin/users` once you can log in, or better, treat
those as bootstrap accounts and create real named accounts before disabling them.

## 4. Deploy

1. Import the repo into Vercel (framework preset: Next.js — detected automatically).
2. Build command / output are Next.js defaults; no changes needed.
3. Confirm the environment variables above are set for the target environment before the first
   deploy.
4. Deploy. Vercel builds with `pnpm build` — this also runs `prisma generate` via the `postinstall`
   hook already configured by `prisma`'s own package scripts.

## 5. Verify after cutover

- `/rules` loads and shows the seeded `VenueSetting`.
- Log in as the seeded ADMIN, confirm `/admin/pricing`, `/admin/users`, `/admin/reports`,
  `/admin/audit` are reachable and a MODERATOR account is refused them.
- Book one real slot end to end on `/book`, then cancel it from `/booking/lookup`, to confirm the
  full write path against the production database.
- `psql "<neon-pooled-url>" -c '\d "Booking"'` and confirm `one_live_booking_per_slot` is present
  with its `WHERE` clause — this is the single most important line in the project (see
  `CLAUDE.md` §2 and `BUILD_PLAN.md` step 1).

## CI

`.github/workflows/ci.yml` runs on every push/PR: typecheck, lint, coverage-gated unit tests,
build, Playwright (concurrency proof + RBAC + axe accessibility) against a real Postgres service
container, then Lighthouse + axe against the production build (`lighthouserc.json`). None of this
touches Neon — CI provisions its own throwaway Postgres container.
