/**
 * Venue slug and venue-code rules.
 *
 * The slug is the venue's public address: `turfly.xyz/{slug}` (path-based —
 * see lib/subdomain.ts's `resolvePathSegment`/`venuePathUrl`, the primary
 * scheme, since wildcard subdomain DNS is not configured on the real
 * deployment). `{slug}.turfly.xyz` is also resolved (`resolveHost`) for any
 * venue that does set up its own wildcard cert later, so both must stay
 * collision-free with every real platform route. The code is folded into
 * every booking reference (`TRF-{code}-2026-0001`), so both are effectively
 * permanent from the owner's first booking onward — validation here is the
 * last cheap moment to get them right.
 */

/**
 * Reserved slugs. Two separate reasons, both real:
 *
 *  - Routing collisions: a venue slug is also a first path segment
 *    (`turfly.xyz/{slug}`, see lib/subdomain.ts's `resolvePathSegment`) and,
 *    for any venue with its own wildcard DNS, a subdomain too. Either one
 *    reusing a real platform route (`/admin`, `/api`, ...) would shadow it.
 *    Exported so middleware can reuse the exact same set rather than a
 *    second list that could drift.
 *  - Impersonation: `mail`, `accounts`, `support`, `billing`, `help`,
 *    `secure`, `login` are the names a phishing page wants. A tenant is
 *    a stranger who redeemed a code; do not hand them a name customers read
 *    as "this is Turfly itself".
 */
export const RESERVED_SLUGS = new Set([
  // platform routing — every top-level app/ route, so a venue slug can never
  // shadow one, whether reached by path or by subdomain.
  'www', 'app', 'admin', 'api', 'dashboard', 'super-admin', 'onboarding',
  'sign-in', 'sign-up', 'book', 'booking', 'rules', 'status', 'default',
  'static', 'assets', 'cdn', 'clerk', 'preview', 'staging', 'test', 'demo',
  'accept-invite', 'actions', 'forgot-password', 'reset-password',
  'select-venue', 'verify-email', 'login', 'booking-not-found',
  // impersonation risk
  'mail', 'email', 'accounts', 'account', 'secure', 'security',
  'support', 'help', 'billing', 'pay', 'payment', 'payments', 'verify',
  'official', 'turfly',
  // ordinary marketing surfaces we may want later
  'blog', 'docs', 'about', 'pricing', 'contact', 'careers', 'legal', 'privacy', 'terms',
]);

/**
 * Must start with a letter, end alphanumeric, 3-32 chars, lowercase letters,
 * digits and single hyphens between. Starting with a letter keeps it a valid
 * DNS label (still relevant for the subdomain scheme) and a valid path
 * segment; no leading/trailing hyphen and no doubled hyphen keeps it
 * readable and avoids the `xn--` punycode prefix shape.
 */
const SLUG_RE = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

/** Shape-only check (length + character rules), no reserved-word check —
 * lib/subdomain.ts's `resolvePathSegment` uses this to decide whether an
 * unrecognised first path segment is even plausibly a venue slug before
 * paying for the rewrite + cookie + database lookup. */
export function looksLikeSlug(candidate: string): boolean {
  return candidate.length >= 3 && candidate.length <= 32 && SLUG_RE.test(candidate);
}

export class InvalidSlugError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidSlugError';
  }
}

export function assertSlugAllowed(slug: string): void {
  if (slug.length < 3 || slug.length > 32) {
    throw new InvalidSlugError('The address must be between 3 and 32 characters.');
  }
  if (!SLUG_RE.test(slug)) {
    throw new InvalidSlugError(
      'Use lowercase letters, numbers and single hyphens. It must start with a letter.',
    );
  }
  if (RESERVED_SLUGS.has(slug)) {
    throw new InvalidSlugError('That address is reserved. Please choose another.');
  }
}

/** Best-effort slug from a venue name, for prefilling the field. */
export function suggestSlug(venueName: string): string {
  return venueName
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .replace(/^[^a-z]+/, '')
    .slice(0, 32)
    .replace(/-+$/, '');
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/**
 * The 4-character code that lands in booking references.
 *
 * Derived from the venue name so an owner recognises their own references,
 * padded from the alphabet when the name is too short or too punctuated to
 * yield four usable characters. Uniqueness is NOT guaranteed here — the
 * caller retries on a P2002 against Venue.code, because checking first and
 * inserting second is a race.
 *
 * "TFLY" is excluded: it is Venue Zero's, and a second venue holding it
 * would make two businesses' references indistinguishable.
 */
export function venueCodeFrom(venueName: string, random = Math.random): string {
  const letters = venueName.toUpperCase().replace(/[^A-Z0-9]/g, '');
  let code = letters.slice(0, 4);
  while (code.length < 4) {
    code += CODE_ALPHABET[Math.floor(random() * CODE_ALPHABET.length)];
  }
  return code === 'TFLY' ? `${code.slice(0, 3)}${CODE_ALPHABET[Math.floor(random() * CODE_ALPHABET.length)]}` : code;
}

/** A fresh random code, for retries after a collision. */
export function randomVenueCode(random = Math.random): string {
  let code = '';
  for (let i = 0; i < 4; i++) code += CODE_ALPHABET[Math.floor(random() * CODE_ALPHABET.length)];
  return code === 'TFLY' ? randomVenueCode(random) : code;
}
