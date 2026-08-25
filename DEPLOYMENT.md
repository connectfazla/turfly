# Deployment — Vercel + Neon

This app targets Vercel (hosting) + Neon (managed Postgres), per `CLAUDE.md` §3. These are the
steps for a first production deploy of the multi-tenant build — auth is in-house (`SECURITY.md`),
there is no Clerk, and there is no seeded staff login.

## 1. Provision Neon

1. Create a project at [neon.tech](https://neon.tech).
2. Use the **DIRECT** connection string for `DATABASE_URL` — the one WITHOUT `-pooler` in the
   hostname. This is the opposite of Neon's own general advice for serverless, and it matters here
   specifically: the pooled endpoint's PgBouncer transaction-mode pooling does not reliably support
   Prisma's interactive `$transaction()` API, which every booking write uses
   (`runSerializable` in `lib/booking-engine.ts`). Using the pooled URL fails with
   `P2028: Transaction not found`, non-deterministically — see `CLAUDE.md` §10.
3. Neon's default `sslmode=require` is fine; Prisma handles it automatically.

## 2. Environment variables

Set these in the Vercel project (Settings → Environment Variables), for both Preview and
Production. `.env.example` has the same list with inline notes — keep the two in sync.

| Variable | Notes |
|---|---|
| `DATABASE_URL` | Neon's **direct** connection string — see above |
| `NEXT_PUBLIC_SITE_URL` | The deployment's own URL, e.g. `https://turfly.app`. Used to build absolute links in auth emails |
| `NEXT_PUBLIC_ROOT_DOMAIN` | Root domain for venue subdomains — see §4 |
| `LOOPS_API_KEY` | From loops.so. Without it, auth emails (verify/reset/invite) are logged to the server console instead of sent — fine for Preview, not for Production |
| `LOOPS_TXN_EMAIL_VERIFY` / `LOOPS_TXN_PASSWORD_RESET` / `LOOPS_TXN_INVITE` / `LOOPS_TXN_DUPLICATE_SIGNUP` | Each a Loops transactionalId — create the four templates in the Loops dashboard first, see `lib/notifications/auth-email.ts` |
| `RESEND_API_KEY` | Booking-confirmation email; from resend.com, once you own the sending domain |
| `SMS_API_KEY` | Reserved — no SMS provider is wired up yet |
| `NOTIFICATIONS_ENABLED` | `true` in production |
| `TZ` | `Asia/Dhaka` — the whole app assumes this; do not change without re-reading `lib/slots.ts` |

`HOLD_MINUTES` / `CANCELLATION_WINDOW_HOURS` / `BOOKING_WINDOW_DAYS` are **not** env vars —
they're per-venue columns on `Venue`, set from the dashboard.

## 3. Migrate before traffic cutover

Run this against the **production** `DATABASE_URL` before the first deploy serves real traffic,
and before every deploy that changes `prisma/schema.prisma`:

```bash
DATABASE_URL="<neon-direct-url>" pnpm prisma migrate deploy
```

`migrate deploy` applies migrations as committed, in filename order — it will **not** regenerate
any of the several hand-edited migrations in `prisma/migrations/` (the partial unique index and
every migration built on top of it — see the note at the bottom of `prisma/schema.prisma`), which
is exactly what you want. Never replace one of these with a fresh `prisma migrate dev` diff.

Then seed the price grid once, for the first environment only:

```bash
DATABASE_URL="<neon-direct-url>" pnpm db:seed
```

This creates Venue Zero and its 112 `SlotRule` rows — **no staff accounts**. A seed script cannot
invent a real password; bootstrap the first account after the deploy is live (§5).

## 4. Subdomain routing (optional at launch)

Every venue is reachable at `{slug}.$NEXT_PUBLIC_ROOT_DOMAIN` — see `lib/request-venue.ts` and
`lib/subdomain.ts`. This needs two things done by hand, outside the codebase, and can be added
after the first deploy without breaking anything (venues stay fully usable at the bare domain
until then):

1. A wildcard DNS record — `*.turfly.app CNAME cname.vercel-dns.com` (exact target per your
   registrar) — pointing at Vercel.
2. `*.turfly.app` added as a domain in the Vercel project (Settings → Domains).

## 5. Deploy

1. Import the repo into Vercel (framework preset: Next.js — detected automatically).
2. Build command / output are Next.js defaults; no changes needed.
3. Confirm every variable in §2 is set for the target environment before the first deploy.
4. Deploy. Vercel builds with `pnpm build`; `package.json`'s own `postinstall` script (`prisma
   generate`) runs first, so the generated client is always in sync with `schema.prisma` on a
   clean install.
5. **Run `pnpm run build` locally first, at least once, before pushing anything that touches JSX
   text.** `tsc --noEmit` passing does not mean `next build` will pass — its lint step catches
   things `tsc` alone does not (e.g. `react/no-unescaped-entities`). See `CLAUDE.md` §10; this has
   broken a deploy before.

## 6. Bootstrap the first account

There is no seeded login. Immediately after the first deploy:

1. Sign up at `/sign-up` with the address you want to operate the platform from, and follow the
   verification link from the email (or the server log, if `LOOPS_API_KEY` isn't set yet).
2. Grant yourself platform admin — this also binds you as Tenant Zero's owner:
   ```bash
   DATABASE_URL="<neon-direct-url>" pnpm exec tsx scripts/grant-platform-admin.ts you@example.com
   ```
3. Sign in at `/sign-in`. You now have `/admin` (Tenant Zero, Owner) and `/super-admin`.
4. From `/super-admin/codes`, issue the first registration code for a real turf owner —
   onboarding (`/onboarding`) is invite-only by design (`CLAUDE.md` §11).

## 7. Verify after cutover

- `/api/health` returns `{"status":"ok"}` — a real `SELECT 1`, so this confirms Vercel can reach
  Neon, not just that the deploy built. Point an uptime monitor at this, not `/`.
- `/rules` loads and shows Venue Zero's rules text.
- Sign in as the platform admin from §6, confirm `/admin/pricing`, `/admin/staff`,
  `/admin/reports`, `/admin/audit`, and `/super-admin` are all reachable.
- **Set the real bKash number and deposit percentage** from `/admin/pricing`'s "Payment settings"
  section — the seeded default is a placeholder. Customers see whatever's in that field
  immediately, so do this before announcing the site.
- Book one real slot end to end on `/book`: submit a bKash TRXN, verify it from
  `/admin/bookings/[id]`, then cancel it from `/booking/lookup` — confirms the full write path
  against the production database, including the payment-verification step.
- `psql "<neon-direct-url>" -c '\d "Booking"'` and confirm `one_live_booking_per_slot` is present,
  keyed `("venueId", date, "slotIndex")`, `WHERE` covering all four live statuses. This is the
  single most important line in the project — see `CLAUDE.md` §2.
- If a Loops key is set: trigger a real password-reset email and confirm it arrives and the link
  works. An unset or wrong template id fails silently into the server log, not a visible error.
- Load the site over plain `http://` once and confirm it redirects to `https://` — Vercel does
  this automatically, but confirm rather than assume, since `Strict-Transport-Security` only
  protects requests *after* the first successful HTTPS one.

## Production hardening already in place

Worth knowing before you announce the site, not things you need to configure:

- **Security headers** (`next.config.ts`): `X-Frame-Options: DENY`, `X-Content-Type-Options:
  nosniff`, `Strict-Transport-Security`, a locked-down `Permissions-Policy`, and no
  `X-Powered-By` header. No `Content-Security-Policy` — this app has no client-side third-party
  scripts today, so a CSP would either be a no-op or a false sense of security; add one
  deliberately if that changes.
- **Sessions are server-side rows, not JWTs** — deactivating a staff member takes effect on their
  next request. See `SECURITY.md` for the full auth threat model, including what is deliberately
  *not* covered (no MFA, no account lockout — read it before you rely on anything not listed).
- **Rate limiting is database-backed** (`RateLimitBucket`, `lib/auth/rate-limit.ts`), specifically
  because Vercel's serverless functions don't guarantee instance reuse. Applies to sign-in,
  sign-up, password reset, registration-code redemption, and `holdSlotAction`.
- **`/api/health`** does a real database round trip, not just "the process is up."
- **`robots.txt`** (`app/robots.ts`) keeps `/admin`, `/super-admin`, `/sign-in`, `/sign-up`,
  `/api/`, and the booking-confirmation/lookup pages out of search indexing.
- **Branded error/404 pages** (`app/error.tsx`, `app/not-found.tsx`) replace Next.js's generic
  ones.

## Public sales demo

`/demo` is a live, unauthenticated demo of the real dashboard for prospective owners — see
`lib/demo.ts`'s header comment for the safety model. It needs its own one-time seed, separate
from `pnpm db:seed`:

```bash
DATABASE_URL="<neon-direct-url>" pnpm exec tsx scripts/create-demo-venue.ts
```

Re-run with `--reset` before a live walkthrough — every visitor shares the same sandbox, so it
accumulates whatever the last visitor clicked. If you'd rather not offer it in production yet,
nothing links to it automatically failing — `getDemoVenue()` returns `null` and the page says so
until the script has been run.

## CI

`.github/workflows/ci.yml` runs on every push/PR: typecheck, lint, coverage-gated unit tests,
build, Playwright (concurrency proof + RBAC + axe accessibility) against a real Postgres service
container, then Lighthouse + axe against the production build (`lighthouserc.json`). None of this
touches Neon — CI provisions its own throwaway Postgres container.

`e2e/rbac.spec.ts` and `e2e/accessibility-admin.spec.ts` each create their own throwaway
Tenant/Venue/User fixture directly via Prisma (a known bcrypt password, no real email involved)
and sign in through the real `/sign-in` form — no mocking, no external test-instance setup, which
in-house auth makes straightforward. Both run on every push.
