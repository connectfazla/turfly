import Link from 'next/link';
import { AuthShell } from '@/components/auth/auth-shell';
import { ForgotPasswordForm } from '@/components/auth/forgot-password-form';

export const metadata = { title: 'Reset password', robots: { index: false, follow: false } };

export default function ForgotPasswordPage() {
  return (
    <AuthShell
      title="Reset your password"
      subtitle="We will email you a link."
      footer={
        <Link href="/sign-in" className="text-accent underline underline-offset-2 hover:no-underline">
          Back to sign in
        </Link>
      }
    >
      <ForgotPasswordForm />
    </AuthShell>
  );
}
