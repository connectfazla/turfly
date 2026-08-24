import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * ROUTE: GET /api/health — public, no login.
 *
 * For uptime monitoring (a Vercel deployment check, an external pinger,
 * `curl` in a deploy script) - deliberately does one real query
 * (`SELECT 1`) rather than just returning 200 unconditionally, since "the
 * Next.js process is up" and "the app can actually serve a booking" are
 * different questions and this app has exactly one dependency that
 * distinguishes them: the database. Returns 503, not a thrown 500, on
 * failure, so a monitor can tell "unhealthy" apart from "route is
 * broken" - and never leaks the underlying error detail (CLAUDE.md §8).
 */
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: 'ok' });
  } catch (err) {
    console.error('[health] database check failed:', err);
    return NextResponse.json({ status: 'error' }, { status: 503 });
  }
}
