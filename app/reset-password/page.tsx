import Link from 'next/link';
import { AuthShell } from '@/components/auth/auth-shell';
import { SetPasswordForm } from '@/components/auth/set-password-form';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Choose a new password', robots: { index: false, follow: false } };

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;

  if (!token) {
    return (
      <AuthShell title="Reset link missing" subtitle="That link is incomplete.">
        <Link href="/forgot-password" className="text-body text-accent underline underline-offset-2">
          Request a new one
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Choose a new password" subtitle="This also signs you out everywhere else.">
      <SetPasswordForm token={token} mode="reset" />
    </AuthShell>
  );
}
