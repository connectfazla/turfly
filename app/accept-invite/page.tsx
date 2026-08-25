import Link from 'next/link';
import { AuthShell } from '@/components/auth/auth-shell';
import { SetPasswordForm } from '@/components/auth/set-password-form';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Accept invitation', robots: { index: false, follow: false } };

export default async function AcceptInvitePage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;

  if (!token) {
    return (
      <AuthShell title="Invitation link missing" subtitle="That link is incomplete.">
        <Link href="/sign-in" className="text-body text-accent underline underline-offset-2">
          Back to sign in
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Set your password" subtitle="You have been added to a turf. Choose a password to get started.">
      <SetPasswordForm token={token} mode="invite" />
    </AuthShell>
  );
}
