/**
 * One-off: renames the demo venue's slug from `demo` to `green-pitch-arena`.
 *
 *   pnpm exec tsx scripts/rename-demo-venue-slug.ts
 *
 * Why this needed a script rather than just changing DEMO_VENUE_SLUG in
 * lib/demo.ts: `demo` is a RESERVED_SLUGS entry (it's the marketing
 * dashboard-demo route, app/demo/page.tsx) and, before the path-based
 * routing pass, that was fine — the venue's `slug` column only mattered for
 * *subdomain* resolution, and `demo.turfly.xyz` never collided with
 * `turfly.xyz/demo`. Once `turfly.xyz/{slug}` became the primary scheme,
 * the demo venue's own slug had to stop being a reserved word, or its
 * public booking page could never be reached by path — `/demo` will always
 * route to the dashboard-demo page, never through the venue-slug rewrite
 * (lib/subdomain.ts's resolvePathSegment() correctly refuses to treat a
 * reserved segment as a venue).
 *
 * `green-pitch-arena` (from DEMO_VENUE_NAME in scripts/create-demo-venue.ts)
 * is not reserved and reads as an ordinary venue link, which is also more
 * honest — a prospect should see what a real tenant's link looks like, not
 * a special-cased word.
 *
 * Idempotent: a no-op if the rename already happened, or if this database
 * was seeded fresh (already correct) after lib/demo.ts's DEMO_VENUE_SLUG
 * was updated.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const OLD_SLUG = 'demo';
const NEW_SLUG = 'green-pitch-arena';

async function main() {
  const already = await prisma.venue.findUnique({ where: { slug: NEW_SLUG } });
  if (already) {
    console.log(`Already renamed — a venue with slug "${NEW_SLUG}" exists (id ${already.id}).`);
    return;
  }

  const venue = await prisma.venue.findUnique({ where: { slug: OLD_SLUG } });
  if (!venue) {
    console.log(`No venue with slug "${OLD_SLUG}" — nothing to rename (demo not seeded on this database).`);
    return;
  }

  await prisma.venue.update({ where: { id: venue.id }, data: { slug: NEW_SLUG } });
  console.log(`Renamed venue ${venue.id} ("${venue.name}") from "${OLD_SLUG}" to "${NEW_SLUG}".`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
