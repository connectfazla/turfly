import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import { AuthShell } from '@/components/auth/auth-shell';
import { SignUpForm } from '@/components/auth/sign-up-form';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Sign up', robots: { index: false, follow: false } };

export default async function SignUpPage() {
  if (await getSessionUser()) redirect('/admin');

  return (
    <AuthShell
      title="Create your account"
      subtitle="You will need a registration code to set up a turf."
      footer={
        <>
          Already have an account?{' '}
          <Link href="/sign-in" className="text-accent underline underline-offset-2 hover:no-underline">
            Sign in
          </Link>
        </>
      }
    >
      <SignUpForm />
    </AuthShell>
  );
}
