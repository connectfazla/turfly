import { NextResponse } from 'next/server';
import { auth } from '@/auth';

/** The four Admin-only routes — CLAUDE.md §7. Everything else under
 * /admin/* just needs any authenticated staff session. */
const ADMIN_ONLY_PREFIXES = ['/admin/pricing', '/admin/reports', '/admin/users', '/admin/audit'];

export default auth((req) => {
  const { pathname } = req.nextUrl;

  if (!req.auth) {
    const loginUrl = new URL('/login', req.nextUrl.origin);
    loginUrl.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(loginUrl);
  }

  const isAdminOnly = ADMIN_ONLY_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  if (isAdminOnly && req.auth.user.role !== 'ADMIN') {
    return NextResponse.redirect(new URL('/admin?forbidden=1', req.nextUrl.origin));
  }

  return NextResponse.next();
});

// Middleware alone is NOT authorisation (CLAUDE.md §7) — every staff
// Server Action re-checks via lib/auth/require-role.ts regardless of this.
export const config = {
  matcher: ['/admin/:path*'],
  // Auth.js's JWT decoding (jose) uses Node APIs (Compression/DecompressionStream)
  // the Edge runtime doesn't support — harmless for our small session payloads,
  // but Next.js 15's Node.js middleware runtime avoids the warning entirely.
  runtime: 'nodejs',
};
