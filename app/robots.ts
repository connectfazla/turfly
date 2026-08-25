import type { MetadataRoute } from 'next';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://turfly.xyz';

/**
 * Crawlers get the marketing site and the public booking pages, and nothing
 * else. The disallowed paths are not secrets — they are all authenticated —
 * but there is no reason to spend crawl budget on sign-in redirects, and a
 * booking-confirmation URL keyed by reference should never surface in search
 * results even though knowing one only reveals what the holder already knows.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/admin',
          '/super-admin',
          '/sign-in',
          '/sign-up',
          '/verify-email',
          '/forgot-password',
          '/reset-password',
          '/accept-invite',
          '/onboarding',
          '/select-venue',
          '/demo',
          '/api/',
          '/book/confirm',
          '/book/success/',
          '/booking/lookup',
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
