import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import { AuthShell } from '@/components/auth/auth-shell';
import { SignInForm } from '@/components/auth/sign-in-form';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Sign in', robots: { index: false, follow: false } };

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  if (await getSessionUser()) redirect(next && next.startsWith('/') ? next : '/admin');

  return (
    <AuthShell
      title="Sign in"
      subtitle="For turf owners and staff."
      footer={
        <>
          Don&apos;t have an account?{' '}
          <Link href="/sign-up" className="text-accent underline underline-offset-2 hover:no-underline">
            Sign up
          </Link>
        </>
      }
    >
      <SignInForm next={next} />
    </AuthShell>
  );
}
