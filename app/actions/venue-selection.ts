/**
 * Sets which venue /admin means for this browser.
 *
 * This is the ONLY place ACTIVE_VENUE_COOKIE is written — everywhere else
 * only reads it (lib/auth/active-venue.ts) and re-validates it against the
 * caller's real grants before trusting it. That's what makes a hand-edited
 * form field or a forged cookie inert rather than a way to switch into a
 * venue you don't have a grant on: assertVenueAccess() below throws before
 * the cookie is ever set.
 */
'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import { assertVenueAccess, ACTIVE_VENUE_COOKIE } from '@/lib/auth/active-venue';

export async function selectVenueAction(venueId: string): Promise<void> {
  const session = await getSessionUser();
  if (!session) redirect('/sign-in?next=/select-venue');

  // Throws ForbiddenError if this venueId isn't actually one of the caller's
  // grants — see the file header. Left uncaught: this is a Server Action
  // invoked from a same-origin form on our own /select-venue page, so there
  // is no ordinary user-facing path that trips it.
  await assertVenueAccess(session.user, venueId);

  (await cookies()).set(ACTIVE_VENUE_COOKIE, venueId, {
    httpOnly: true, // JS cannot read or forge it via document.cookie
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
  });

  redirect('/admin');
}
