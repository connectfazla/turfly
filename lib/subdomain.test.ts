import { describe, expect, it } from 'vitest';
import { resolveHost, venueUrl } from './subdomain';

const ROOT = 'turfly.app';

describe('resolveHost', () => {
  it('reads a venue slug from a subdomain', () => {
    expect(resolveHost('dhanmondi.turfly.app', ROOT).venueSlug).toBe('dhanmondi');
  });

  it('treats the bare domain and www as the platform', () => {
    expect(resolveHost('turfly.app', ROOT).venueSlug).toBeNull();
    expect(resolveHost('www.turfly.app', ROOT).venueSlug).toBeNull();
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
      expect(resolveHost(`${h}.turfly.app`, ROOT).venueSlug).toBeNull();
    }
  });

  it('refuses a nested label', () => {
    // a.b.turfly.app must not resolve to "a" — otherwise a wildcard
    // certificate mistake becomes a routing surprise.
    expect(resolveHost('a.b.turfly.app', ROOT).venueSlug).toBeNull();
  });

  it('treats Vercel preview hosts as the platform', () => {
    expect(resolveHost('turfly-git-main-abc.vercel.app', ROOT).venueSlug).toBeNull();
  });

  it('does not guess a slug from an unrelated host', () => {
    expect(resolveHost('evil.example.com', ROOT).venueSlug).toBeNull();
  });

  it('is case-insensitive and tolerates a trailing dot', () => {
    expect(resolveHost('Dhanmondi.Turfly.App.', ROOT).venueSlug).toBe('dhanmondi');
  });

  it('handles a missing host header', () => {
    expect(resolveHost(null, ROOT).venueSlug).toBeNull();
  });
});

describe('venueUrl', () => {
  it('builds the public booking address', () => {
    expect(venueUrl('dhanmondi', ROOT)).toBe('https://dhanmondi.turfly.app');
  });
});
