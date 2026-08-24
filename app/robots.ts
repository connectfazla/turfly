import type { MetadataRoute } from 'next';

/**
 * ROUTE: /robots.txt — generated, public.
 *
 * Public booking pages are fine to index; nothing under /admin, /login,
 * or /api should ever show up in search results (none of it is secret —
 * middleware.ts already gates /admin/* behind a session — but there's no
 * reason to invite crawler traffic at authenticated or programmatic
 * routes either).
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/admin', '/admin/', '/login', '/api/', '/status'],
    },
  };
}
