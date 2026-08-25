/**
 * Resolving a venue from the request — two independent schemes.
 *
 * PATH-based (`turfly.xyz/{slug}`) is the primary scheme in production: it
 * needs no DNS beyond the one A/CNAME record already pointing the bare
 * domain at Vercel, so it works with Cloudflare kept as the authoritative
 * nameserver (no NS delegation, no wildcard cert). `resolvePathSegment`
 * decides whether a request's first path segment is a venue slug; when it
 * is, middleware.ts rewrites to the un-prefixed route and sets
 * `PATH_VENUE_COOKIE` so every subsequent request on that origin — including
 * ones that hit an absolute path like `/book/confirm` with no slug in it —
 * still resolves to the right venue (lib/request-venue.ts reads the cookie
 * as its second-priority source, same trust-tier shape as
 * lib/auth/active-venue.ts's `turfly_venue` cookie).
 *
 * HOST-based (`{slug}.turfly.xyz`) is `resolveHost`, kept for any venue that
 * does configure its own wildcard subdomain later — lib/request-venue.ts
 * tries this first and only falls back to the path cookie when the host is
 * the bare platform domain.
 *
 * Either way, the public booking pages keep their ordinary paths (`/book`,
 * `/rules`) — the request tells getRequestVenue() which venue, and it is a
 * pure string function tested on its own rather than something tangled into
 * middleware.
 */
import { RESERVED_SLUGS, looksLikeSlug } from './venue-slug';

/** The cookie middleware sets when it resolves a venue from a path segment.
 * Not trusted on its own — lib/request-venue.ts re-derives the venue from
 * the database before using it, exactly like `turfly_venue` (CLAUDE.md's
 * "never trust, always re-derive" pattern).
 *
 * Known limitation, same shape as `turfly_venue`'s own: it is shared across
 * every tab on the origin, so a customer with two different venues' booking
 * pages open in two tabs can have the second overwrite what the first one
 * resolves to. That is harmless for the actual booking WRITE — holdSlotAction
 * (app/actions/bookings.ts) derives venueId from the field the customer
 * clicked, not from this cookie, and lib/booking-engine.ts's holdSlot()
 * would refuse a mismatched field/venue pair outright either way — so the
 * worst case is a stale READ (the wrong venue's grid displayed) until the
 * next full navigation, never a booking landing on the wrong tenant. */
export const PATH_VENUE_COOKIE = 'turfly_path_venue';

/** The request header middleware sets, ONLY on a request it just rewrote —
 * never persisted, never sent by anything but middleware.ts itself. This is
 * what lets lib/request-venue.ts tell "this exact request's own URL named
 * this venue" (present) apart from "PATH_VENUE_COOKIE says so, but that was
 * a different, earlier request" (absent). The distinction matters: an
 * unresolvable slug named by THIS request is a genuine not-found, worth
 * redirecting to app/booking-not-found for; an unresolvable slug named only
 * by a stale cookie must NOT redirect — that page itself has no slug in its
 * own URL, so it would inherit the same stale cookie and redirect to
 * itself, forever. A soft fallback to Venue Zero handles that case instead
 * (see getRequestVenue()'s comment). */
export const PATH_VENUE_HEADER = 'x-turfly-path-venue';

/** Hosts that are the platform itself, not a venue. `www` and the bare domain
 * serve the marketing site; the rest are reserved in lib/venue-slug.ts too,
 * but listing them here as well means a routing decision never depends on a
 * validation rule staying in sync. */
const PLATFORM_HOSTS = new Set(['www', 'app', 'admin', 'api', 'dashboard', 'static', 'assets', 'cdn']);

/**
 * Local development: `*.lvh.me` and `*.localtest.me` both resolve to
 * 127.0.0.1 publicly, so `dhanmondi.lvh.me:3000` works with no /etc/hosts
 * editing and no wildcard DNS. Vercel preview deployments are also treated
 * as platform hosts, since their generated hostnames are not venue slugs.
 */
const DEV_ROOTS = ['lvh.me', 'localtest.me', 'localhost'];

export interface HostResolution {
  /** The venue slug, or null when this host is the platform itself. */
  venueSlug: string | null;
  /** True for localhost/lvh.me — callers may want to relax cookie flags. */
  isLocal: boolean;
}

/**
 * @param host the raw `host` header, e.g. "dhanmondi.turfly.xyz" or
 *   "dhanmondi.lvh.me:3000".
 * @param rootDomain the deployment's own domain, from NEXT_PUBLIC_ROOT_DOMAIN.
 */
export function resolveHost(host: string | null, rootDomain: string): HostResolution {
  if (!host) return { venueSlug: null, isLocal: false };

  // Strip the port and any trailing dot (a fully-qualified name).
  const hostname = host.split(':')[0]!.toLowerCase().replace(/\.$/, '');
  const isLocal = DEV_ROOTS.some((r) => hostname === r || hostname.endsWith(`.${r}`));

  // A Vercel preview URL is not a venue. Without this, a deploy preview would
  // try to resolve its own generated hostname as a slug and 404 the whole
  // site.
  if (hostname.endsWith('.vercel.app')) return { venueSlug: null, isLocal: false };

  const root = isLocal ? DEV_ROOTS.find((r) => hostname === r || hostname.endsWith(`.${r}`))! : rootDomain.toLowerCase();

  if (hostname === root) return { venueSlug: null, isLocal };
  if (!hostname.endsWith(`.${root}`)) {
    // An unrecognised host — a custom domain we do not serve, or a stray
    // Host header. Treat as platform rather than guessing a slug from it.
    return { venueSlug: null, isLocal };
  }

  const label = hostname.slice(0, -(root.length + 1));
  // Only a single label is a venue. `a.b.turfly.xyz` is not `a` — refusing it
  // means a nested wildcard certificate mistake cannot become a routing
  // surprise.
  if (label.includes('.')) return { venueSlug: null, isLocal };
  if (PLATFORM_HOSTS.has(label)) return { venueSlug: null, isLocal };

  return { venueSlug: label, isLocal };
}

/** The subdomain-scheme booking URL for a venue. Not currently shown
 * anywhere in the product — no venue has wildcard DNS configured — but kept
 * for the day one does; `venuePathUrl` below is what the dashboard and
 * emails actually link to today. */
export function venueUrl(slug: string, rootDomain: string, protocol = 'https'): string {
  return `${protocol}://${slug}.${rootDomain}`;
}

/** The path-scheme booking URL for a venue — `turfly.xyz/{slug}` — used by
 * the admin dashboard's "your booking page" link and the branding page. */
export function venuePathUrl(slug: string, rootDomain: string, protocol = 'https'): string {
  return `${protocol}://${rootDomain}/${slug}`;
}

export interface PathVenueResolution {
  /** The candidate venue slug — NOT yet verified against the database. */
  slug: string;
  /** The path to rewrite to, with the slug segment stripped. Empty string
   * means the request was for the venue's root (`/{slug}` with nothing
   * after it), which the caller maps to `/book`. */
  rest: string;
}

/**
 * Decides whether a request path's first segment is a venue slug, for
 * middleware.ts to rewrite. Pure and synchronous — no database lookup here,
 * which is exactly why this can run in middleware at all; the actual
 * existence/active check happens once, in getRequestVenue(), from a Server
 * Component.
 *
 * Returns null for the platform's own routes (any RESERVED_SLUGS segment —
 * `/admin`, `/book`, `/api/...`, etc. — routes normally, untouched) and for
 * anything that cannot possibly be a slug (the root path, or a first segment
 * that fails the same shape check `assertSlugAllowed` enforces at signup).
 * A segment that merely LOOKS like a slug but isn't a real venue is not
 * rejected here — that 404s cleanly from getRequestVenue()'s database
 * lookup instead, the same as visiting an unknown subdomain today.
 */
export function resolvePathSegment(pathname: string): PathVenueResolution | null {
  if (pathname === '/') return null;
  const parts = pathname.split('/');
  const first = parts[1];
  if (!first || RESERVED_SLUGS.has(first) || !looksLikeSlug(first)) return null;
  const rest = parts.slice(2).join('/');
  return { slug: first, rest: rest ? `/${rest}` : '' };
}
