'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { acceptInviteAction, resetPasswordAction } from '@/app/actions/auth';
import { MIN_PASSWORD_LENGTH } from '@/lib/auth/constants';
import { Button } from '@/components/ui/button';
import { PasswordField } from './password-field';

/** Shared by the reset and invite flows — same form, same token mechanics,
 * different action and wording. */
export function SetPasswordForm({ token, mode }: { token: string; mode: 'reset' | 'invite' }) {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    // Checked client-side only: it guards against a typo, not an attacker,
    // so there is nothing for the server to re-verify.
    if (password !== confirm) {
      setError('Those passwords do not match.');
      return;
    }
    setPending(true);
    setError(null);
    const result =
      mode === 'invite'
        ? await acceptInviteAction({ token, password })
        : await resetPasswordAction({ token, password });
    if (!result.ok) {
      setPending(false);
      setError(result.error);
      return;
    }
    router.push('/admin');
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <PasswordField
        id="new-password"
        label="New password"
        autoComplete="new-password"
        value={password}
        onChange={setPassword}
        hint={`At least ${MIN_PASSWORD_LENGTH} characters.`}
      />
      <PasswordField
        id="confirm-password"
        label="Confirm password"
        autoComplete="new-password"
        value={confirm}
        onChange={setConfirm}
      />

      {error ? (
        <p role="alert" className="text-caption text-danger">
          {error}
        </p>
      ) : null}

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? 'Saving…' : mode === 'invite' ? 'Set password and continue' : 'Change password'}
      </Button>

      {error ? (
        <Link
          href={mode === 'invite' ? '/sign-in' : '/forgot-password'}
          className="text-center text-caption text-text-muted underline underline-offset-2"
        >
          {mode === 'invite' ? 'Back to sign in' : 'Request a new link'}
        </Link>
      ) : null}
    </form>
  );
}
