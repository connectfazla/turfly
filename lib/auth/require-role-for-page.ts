/**
 * Page-only wrapper around requireRole(): on refusal, redirects to the
 * dashboard's existing "you don't have permission" banner instead of
 * letting ForbiddenError/UnauthorizedError fall through to the generic
 * error boundary (app/error.tsx's "We hit a snag").
 *
 * That generic boundary is indistinguishable from a real bug — no help for
 * a legitimate staff member who mistyped a URL, and actively wrong for the
 * public demo (/demo), which explicitly invites a visitor to try a Bookie
 * account against an Owner-only page specifically to see it refuse cleanly.
 *
 * Deliberately NOT folded into requireRole() itself: that function is also
 * called from Server Actions, which must return `{ ok: false, error }` and
 * never redirect — redirecting mid-mutation would be a confusing UX and
 * wrong for a fetch-based form submission. This wrapper is for the small
 * number of page.tsx Server Components gated to a role narrower than "any
 * staff" (Pricing, Staff, Reports, Audit), where a redirect is exactly
 * right.
 */
import { redirect } from 'next/navigation';
import { ForbiddenError, requireRole, UnauthorizedError, type StaffRole, type StaffUser } from './require-role';

export async function requireRoleForPage(...roles: StaffRole[]): Promise<StaffUser> {
  try {
    return await requireRole(...roles);
  } catch (err) {
    if (err instanceof ForbiddenError || err instanceof UnauthorizedError) {
      redirect('/admin?forbidden=1');
    }
    throw err;
  }
}
