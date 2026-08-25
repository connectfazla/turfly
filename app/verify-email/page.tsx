import Link from 'next/link';
import { verifyEmailAction } from '@/app/actions/auth';
import { AuthShell } from '@/components/auth/auth-shell';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Verify email', robots: { index: false, follow: false } };

/**
 * Verification runs on GET rather than behind a button.
 *
 * Following a link from your own inbox is the proof; making the person click
 * again adds a step without adding security. The token is single-use, so a
 * mail scanner prefetching it costs the user one "already used" message and
 * a re-request — an acceptable trade for a flow people abandon when it has
 * two steps.
 */
export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;

  if (!token) {
    return (
      <AuthShell title="Verification link missing" subtitle="That link is incomplete.">
        <Link href="/sign-in" className="text-body text-accent underline underline-offset-2">
          Back to sign in
        </Link>
      </AuthShell>
    );
  }

  const result = await verifyEmailAction(token);

  if (!result.ok) {
    return (
      <AuthShell title="We could not verify that" subtitle={result.error}>
        <Link href="/sign-in" className="text-body text-accent underline underline-offset-2">
          Back to sign in
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Email confirmed" subtitle="You are signed in.">
      <div className="flex flex-col gap-3">
        <Link
          href="/onboarding"
          className="rounded-(--radius-input) bg-accent px-4 py-2 text-center text-body text-white transition-colors hover:bg-accent/90"
        >
          Set up your turf
        </Link>
        <Link href="/admin" className="text-center text-caption text-text-muted underline underline-offset-2">
          Or go to your dashboard
        </Link>
      </div>
    </AuthShell>
  );
}
