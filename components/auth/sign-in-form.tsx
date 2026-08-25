'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { signInAction } from '@/app/actions/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PasswordField } from './password-field';

export function SignInForm({ next }: { next?: string }) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const result = await signInAction({ email, password });
    if (!result.ok) {
      setPending(false);
      setError(result.error);
      return;
    }
    // Only ever follow a same-origin path, so ?next= cannot be used to bounce
    // someone to another site after they authenticate here.
    router.push(next && next.startsWith('/') && !next.startsWith('//') ? next : '/admin');
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="rounded-(--radius-input)"
          required
        />
      </div>

      <PasswordField value={password} onChange={setPassword} />

      {error ? (
        <p role="alert" className="text-caption text-danger">
          {error}
        </p>
      ) : null}

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? 'Signing in…' : 'Sign in'}
      </Button>

      <Link
        href="/forgot-password"
        className="text-center text-caption text-text-muted underline underline-offset-2 hover:text-text"
      >
        Forgot your password?
      </Link>
    </form>
  );
}
