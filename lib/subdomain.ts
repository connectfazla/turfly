/**
 * Resolving a venue from the request host.
 *
 * Each venue is reachable at `{slug}.turfly.xyz`. The public booking pages
 * keep their ordinary paths (`/book`, `/rules`) — only the host distinguishes
 * one venue from another, which is why this is a pure string function tested
 * on its own rather than something tangled into middleware.
 */

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

/** The public booking URL for a venue. Used in the dashboard and in emails. */
export function venueUrl(slug: string, rootDomain: string, protocol = 'https'): string {
  return `${protocol}://${slug}.${rootDomain}`;
}
