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
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk publishable key for the production instance |
| `CLERK_SECRET_KEY` | Clerk secret key for the production instance — never the dev one |
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

`migrate deploy` applies migrations as committed, in filename order — it will **not** regenerate
the two hand-edited migrations that touch the partial unique index (the original
`one_live_booking_per_slot`, and the later one that widened its `WHERE` clause to include
`PENDING_VERIFICATION`; see the note at the bottom of `prisma/schema.prisma`), which is exactly
what you want. Never replace either with a fresh `prisma migrate dev` diff.

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
4. Deploy. Vercel builds with `pnpm build`; `package.json`'s own `postinstall` script (`prisma
   generate`) runs first, so the generated client is always in sync with `schema.prisma` on a
   clean install — deliberately not relied on as an implicit side effect of installing `prisma`
   itself, since pnpm's dependency-script policy has changed across major versions and a build
   that quietly stops generating the client fails in a confusing way (a runtime "cannot find
   module" deep in `.prisma/client`, not a clear build error).

## 5. Verify after cutover

- `/rules` loads and shows the seeded `VenueSetting`.
- `/api/health` returns `{"status":"ok"}` — it runs a real `SELECT 1`, so this also confirms
  Vercel can actually reach Neon, not just that the deploy built.
- Log in as the seeded ADMIN, confirm `/admin/pricing`, `/admin/users`, `/admin/reports`,
  `/admin/audit` are reachable and a MODERATOR account is refused them.
- **Set the real bKash number, advance amount, and verification window** from `/admin/pricing`'s
  "Payment settings" section — the seeded default (`01700000000`) is a placeholder and was never
  committed to source on purpose (see `CLAUDE.md` §8: no secrets in code). Customers will see
  whatever's in that field immediately, so do this before announcing the site.
- Book one real slot end to end on `/book`, submit a bKash TRXN, verify it from
  `/admin/bookings/[id]`, then cancel it from `/booking/lookup` — confirms the full write path,
  including the new payment-verification step, against the production database.
- `psql "<neon-pooled-url>" -c '\d "Booking"'` and confirm `one_live_booking_per_slot` is present
  with its `WHERE` clause covering all four live statuses — this is the single most important line
  in the project (see `CLAUDE.md` §2 and `BUILD_PLAN.md` step 1).
- Load the site over plain `http://` once and confirm it redirects to `https://` — Vercel does
  this automatically, but it's worth confirming rather than assuming, since `Strict-Transport-
  Security` (see below) only protects requests *after* the first successful HTTPS one.

## Production hardening already in place

Worth knowing before you announce the site, not things you need to configure:

- **Security headers** (`next.config.ts`): `X-Frame-Options: DENY`, `X-Content-Type-Options:
  nosniff`, `Strict-Transport-Security`, a locked-down `Permissions-Policy`, and no
  `X-Powered-By` header. No `Content-Security-Policy` — this app has no client-side third-party
  scripts today, so a CSP would either be a no-op or (worse) a false sense of security; add one
  deliberately if that changes.
- **Rate limiting is database-backed** (`RateLimitBucket`, `lib/auth/rate-limit.ts`), specifically
  because Vercel's serverless functions don't guarantee instance reuse — an in-memory limiter
  would silently stop limiting anything in production. Applies to login attempts and to
  `holdSlotAction` (the entry point of the public booking flow).
- **`/api/health`** does a real database round trip, not just "the process is up" — point your
  uptime monitor at it, not `/`.
- **`robots.txt`** (`app/robots.ts`) disallows `/admin`, `/login`, `/api/` from search indexing.
- **Branded error/404 pages** (`app/error.tsx`, `app/not-found.tsx`) replace Next.js's generic
  ones — a customer mid-booking who hits an error still sees the app's own design, with a way
  back to `/book`, not a bare stack-trace-adjacent page.

## CI

`.github/workflows/ci.yml` runs on every push/PR: typecheck, lint, coverage-gated unit tests,
build, Playwright (concurrency proof + RBAC + axe accessibility) against a real Postgres service
container, then Lighthouse + axe against the production build (`lighthouserc.json`). None of this
touches Neon — CI provisions its own throwaway Postgres container.
