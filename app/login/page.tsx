/**
 * ROUTE: /login — public (staff sign-in; not for Customers, who never
 * authenticate at all - CLAUDE.md §5).
 *
 * middleware.ts sends unauthenticated visitors to /admin/* here, with
 * ?callbackUrl= set to where they were headed. Already-signed-in staff
 * are bounced straight to /admin.
 */
import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { LoginForm } from '@/components/auth/login-form';
import { getVenueName } from '@/lib/venue';

export default async function LoginPage() {
  const session = await auth();
  if (session?.user) redirect('/admin');
  const venueName = await getVenueName();

  return (
    <div className="flex min-h-dvh items-center justify-center bg-surface px-4">
      <div className="w-full max-w-sm">
        <h1 className="text-heading text-text">Staff sign in</h1>
        <p className="mt-1 text-body text-text-muted">{venueName} admin panel</p>
        <div className="mt-6">
          <Suspense>
            <LoginForm />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
