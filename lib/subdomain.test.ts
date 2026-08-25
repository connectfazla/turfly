import { describe, expect, it } from 'vitest';
import { resolveHost, resolvePathSegment, venuePathUrl, venueUrl } from './subdomain';

const ROOT = 'turfly.xyz';

describe('resolveHost', () => {
  it('reads a venue slug from a subdomain', () => {
    expect(resolveHost('dhanmondi.turfly.xyz', ROOT).venueSlug).toBe('dhanmondi');
  });

  it('treats the bare domain and www as the platform', () => {
    expect(resolveHost('turfly.xyz', ROOT).venueSlug).toBeNull();
    expect(resolveHost('www.turfly.xyz', ROOT).venueSlug).toBeNull();
  });

  it('ignores the port', () => {
    expect(resolveHost('dhanmondi.lvh.me:3000', ROOT).venueSlug).toBe('dhanmondi');
  });

  it('supports lvh.me for local development', () => {
    const r = resolveHost('dhanmondi.lvh.me:3000', ROOT);
    expect(r.venueSlug).toBe('dhanmondi');
    expect(r.isLocal).toBe(true);
  });

  it('treats plain localhost as the platform', () => {
    expect(resolveHost('localhost:3000', ROOT).venueSlug).toBeNull();
  });

  it('never resolves a reserved platform host as a venue', () => {
    for (const h of ['admin', 'api', 'www', 'app', 'cdn']) {
      expect(resolveHost(`${h}.turfly.xyz`, ROOT).venueSlug).toBeNull();
    }
  });

  it('refuses a nested label', () => {
    // a.b.turfly.xyz must not resolve to "a" — otherwise a wildcard
    // certificate mistake becomes a routing surprise.
    expect(resolveHost('a.b.turfly.xyz', ROOT).venueSlug).toBeNull();
  });

  it('treats Vercel preview hosts as the platform', () => {
    expect(resolveHost('turfly-git-main-abc.vercel.app', ROOT).venueSlug).toBeNull();
  });

  it('does not guess a slug from an unrelated host', () => {
    expect(resolveHost('evil.example.com', ROOT).venueSlug).toBeNull();
  });

  it('is case-insensitive and tolerates a trailing dot', () => {
    expect(resolveHost('Dhanmondi.Turfly.Xyz.', ROOT).venueSlug).toBe('dhanmondi');
  });

  it('handles a missing host header', () => {
    expect(resolveHost(null, ROOT).venueSlug).toBeNull();
  });
});

describe('venueUrl', () => {
  it('builds the subdomain-scheme address', () => {
    expect(venueUrl('dhanmondi', ROOT)).toBe('https://dhanmondi.turfly.xyz');
  });
});

describe('venuePathUrl', () => {
  it('builds the path-scheme address — the one the product actually links to', () => {
    expect(venuePathUrl('dhanmondi', ROOT)).toBe('https://turfly.xyz/dhanmondi');
  });
});

describe('resolvePathSegment', () => {
  it('resolves a first path segment as a candidate venue slug', () => {
    expect(resolvePathSegment('/dhanmondi/book/2026-08-27')).toEqual({
      slug: 'dhanmondi',
      rest: '/book/2026-08-27',
    });
  });

  it('maps a bare `/{slug}` to an empty rest, for the caller to default to /book', () => {
    expect(resolvePathSegment('/dhanmondi')).toEqual({ slug: 'dhanmondi', rest: '' });
  });

  it('never treats a reserved platform route as a venue slug', () => {
    for (const p of ['/admin', '/admin/pricing', '/api/availability', '/book', '/sign-in', '/rules', '/demo']) {
      expect(resolvePathSegment(p)).toBeNull();
    }
  });

  it('treats the root path as the platform, not a venue', () => {
    expect(resolvePathSegment('/')).toBeNull();
  });

  it('refuses a segment that fails the slug shape rules', () => {
    expect(resolvePathSegment('/ab')).toBeNull(); // too short
    expect(resolvePathSegment('/Has-Caps')).toBeNull();
    expect(resolvePathSegment('/-leading-hyphen')).toBeNull();
  });

  it('preserves a deeper path unchanged after stripping the slug', () => {
    expect(resolvePathSegment('/dhanmondi/booking/lookup')).toEqual({
      slug: 'dhanmondi',
      rest: '/booking/lookup',
    });
  });
});
