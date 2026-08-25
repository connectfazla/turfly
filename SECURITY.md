# Security

Turfly runs its own authentication. This file states plainly what that
protects against and what it does not, because "we built our own auth" is a
claim that deserves specifics rather than reassurance.

Last reviewed: 2026-08-25.

## What authenticates

Only **staff** — owners, managers, bookies, and the platform operator.
**Customers never authenticate.** A booking is made with a name and a phone
number; there is no customer account, no customer password, and therefore no
customer credential to leak. This is the single biggest reason the auth
surface here is small.

## What is protected

**Passwords** are bcrypt, cost 12 (~250ms per verification). Plaintext is
never stored, logged, or emailed.

**A null password hash can never authenticate.** An invited staff member has a
`User` row and a venue grant but no password until they accept. `verifyPassword`
refuses before it compares, so "no password set" can never be mistaken for
"no password required" — `lib/auth/password.ts`.

**Email enumeration is closed.** Sign-in returns one message for a wrong
password and an unknown address, and burns equivalent bcrypt time on the
unknown case so latency does not distinguish them (measured ratio 1.00).
Sign-up and forgot-password always report success regardless of whether the
address is registered. Your users are business owners; "which turf owners use
Turfly" is not answerable from the outside.

**Sessions are server-side rows, not JWTs.** Deactivating a staff member takes
effect on their next request. A stateless token could not be revoked before
expiry. Cookies are `httpOnly` (an XSS bug cannot exfiltrate the session),
`SameSite=Lax`, and `Secure` in production. Sessions last 8 hours with sliding
renewal past the halfway mark.

**Session and token values are stored as SHA-256, never in the clear.** A
leaked database backup contains no usable session cookies and no working
reset links.

**Tokens are single-use and expiring** — invites 7 days, verification 24
hours, password resets 1 hour. Single-use is enforced by `updateMany` with
`usedAt: null` in the WHERE, so two simultaneous clicks cannot both succeed.
Issuing a new token invalidates the previous unused one of the same type, so
old reset links in an inbox stop working.

**A password reset destroys every other session** for that user. Otherwise
"someone has my password, I will change it" would leave the intruder signed
in.

**An owner cannot email a "set your password" link to an existing account.**
Staff invites only send a link when the target has no password yet —
otherwise adding a staff member would be a password reset any owner could
trigger for any address they can type.

**Rate limiting** is per-IP on sign-in, sign-up, password reset and
registration-code redemption (`lib/auth/rate-limit.ts`, Postgres-backed).

**Authorization is re-checked in every page and Server Action**, never
inferred from middleware. Middleware only checks that a session cookie is
*present* — it cannot afford a database round trip on every request, and a
forged cookie gets past it. The real gate is `requireRole()` /
`requireSuperAdmin()`, which resolve the session and the caller's grants
against the database. See CLAUDE.md §7 and §11.

**Tenant isolation** is verified by script, not by assumption:
`scripts/verify-tenant-isolation.ts` and a second tenant fixture
(`scripts/create-test-venue.ts`), because with one venue every cross-tenant
bug is invisible.

## What is NOT protected

These are deliberate omissions, not oversights. Each is a decision that can be
revisited.

- **No multi-factor authentication.** A stolen password is full access to that
  person's venue. This is the most significant gap; it matters most for owner
  accounts, which can see revenue and change pricing.
- **No CSRF tokens.** Protection rests entirely on `SameSite=Lax` plus Next.js
  Server Actions' own origin checking. That is adequate for current browsers
  and is what most Next.js applications rely on, but it is one mechanism, not
  two.
- **No account lockout after repeated failures** — only IP rate limiting. A
  distributed attempt from many addresses against one known email is not
  currently slowed.
- **No breach-password checking.** Nothing stops a staff member choosing a
  password that appears in a known breach corpus.
- **No password composition rules.** Minimum length 10, nothing else. This is
  intentional — length beats forced symbols — but it means "aaaaaaaaaa" is
  accepted.
- **No session listing or remote sign-out UI.** A user cannot see or revoke
  their other sessions; only a password reset clears them all.
- **No audit trail for authentication events.** Booking and staff mutations
  are audited; sign-ins, failures and resets are not.
- **Email delivery is best-effort.** If Loops is unreachable, verification and
  reset links are logged to the server console and not delivered. Access
  control never depends on delivery, but a person can be left waiting.

## Reporting

Security issues: email the address in the repository owner's GitHub profile.
Please do not open a public issue.
