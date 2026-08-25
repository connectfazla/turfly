import type { MetadataRoute } from 'next';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://turfly.app';

/**
 * Only the pages worth indexing: the marketing site and the two evergreen
 * public pages. Deliberately NOT the per-date booking pages — /book/[date]
 * generates an unbounded set of near-identical URLs that go stale the moment
 * the date passes, which is how a small site talks itself into a thin-content
 * problem.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: SITE_URL, lastModified: now, changeFrequency: 'weekly', priority: 1 },
    { url: `${SITE_URL}/book`, lastModified: now, changeFrequency: 'daily', priority: 0.7 },
    { url: `${SITE_URL}/rules`, lastModified: now, changeFrequency: 'monthly', priority: 0.4 },
  ];
}
