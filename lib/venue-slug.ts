/**
 * Venue slug and venue-code rules.
 *
 * The slug becomes a subdomain (`{slug}.turfly.xyz`) and the code is folded
 * into every booking reference (`TRF-{code}-2026-0001`), so both are effectively
 * permanent from the owner's first booking onward — validation here is the last
 * cheap moment to get them right.
 */

/**
 * Reserved slugs. Two separate reasons, both real:
 *
 *  - Routing collisions: a venue at `admin.turfly.xyz` or `api.turfly.xyz`
 *    would shadow a platform surface once subdomain routing ships.
 *  - Impersonation: `mail`, `accounts`, `support`, `billing`, `help`,
 *    `secure`, `login` are the subdomains a phishing page wants. A tenant is
 *    a stranger who redeemed a code; do not hand them a name customers read
 *    as "this is Turfly itself".
 */
const RESERVED_SLUGS = new Set([
  // platform routing
  'www', 'app', 'admin', 'api', 'dashboard', 'super-admin', 'onboarding',
  'sign-in', 'sign-up', 'book', 'booking', 'rules', 'status', 'default',
  'static', 'assets', 'cdn', 'clerk', 'preview', 'staging', 'test', 'demo',
  // impersonation risk
  'mail', 'email', 'accounts', 'account', 'login', 'secure', 'security',
  'support', 'help', 'billing', 'pay', 'payment', 'payments', 'verify',
  'official', 'turfly',
  // ordinary marketing surfaces we may want later
  'blog', 'docs', 'about', 'pricing', 'contact', 'careers', 'legal', 'privacy', 'terms',
]);

/**
 * Must start with a letter, end alphanumeric, 3-32 chars, lowercase letters,
 * digits and single hyphens between. Starting with a letter keeps it a valid
 * DNS label; no leading/trailing hyphen and no doubled hyphen keeps it
 * readable and avoids the `xn--` punycode prefix shape.
 */
const SLUG_RE = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

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
