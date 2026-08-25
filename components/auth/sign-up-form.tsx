'use client';

import { useState } from 'react';
import { signUpAction } from '@/app/actions/auth';
import { MIN_PASSWORD_LENGTH } from '@/lib/auth/constants';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PasswordField } from './password-field';

export function SignUpForm() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const result = await signUpAction({ name, email, password });
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSent(true);
  }

  // Shown whether or not the address was already registered — the server
  // deliberately does not distinguish, so neither can this.
  if (sent) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-body text-text">Check your email.</p>
        <p className="text-caption text-text-muted">
          If <span className="text-text">{email}</span> can be used, we have sent a link to confirm it. The link
          expires in 24 hours.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="name">Your name</Label>
        <Input
          id="name"
          autoComplete="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="rounded-(--radius-input)"
          required
        />
      </div>

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

      <PasswordField
        autoComplete="new-password"
        value={password}
        onChange={setPassword}
        hint={`At least ${MIN_PASSWORD_LENGTH} characters. A short phrase works well.`}
      />

      {error ? (
        <p role="alert" className="text-caption text-danger">
          {error}
        </p>
      ) : null}

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? 'Creating account…' : 'Create account'}
      </Button>
    </form>
  );
}
