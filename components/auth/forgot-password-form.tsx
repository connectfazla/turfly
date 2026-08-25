'use client';

import { useState } from 'react';
import { requestPasswordResetAction } from '@/app/actions/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function ForgotPasswordForm() {
  const [email, setEmail] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const result = await requestPasswordResetAction(email);
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSent(true);
  }

  // Identical whether or not the address exists. This screen is the reason
  // the action always returns ok — anything else turns this form into a way
  // to check who has an account.
  if (sent) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-body text-text">Check your email.</p>
        <p className="text-caption text-text-muted">
          If <span className="text-text">{email}</span> has an account, a reset link is on its way. It expires in an
          hour.
        </p>
      </div>
    );
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

      {error ? (
        <p role="alert" className="text-caption text-danger">
          {error}
        </p>
      ) : null}

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? 'Sending…' : 'Send reset link'}
      </Button>
    </form>
  );
}
