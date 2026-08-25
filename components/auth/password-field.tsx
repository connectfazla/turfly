'use client';

import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/** Password input with a show/hide toggle. The toggle is not a nicety: on a
 * phone keyboard, a long passphrase typed blind is the main reason people
 * pick a short one instead. */
export function PasswordField({
  id = 'password',
  label = 'Password',
  autoComplete = 'current-password',
  value,
  onChange,
  hint,
  error,
}: {
  id?: string;
  label?: string;
  autoComplete?: 'current-password' | 'new-password';
  value: string;
  onChange: (v: string) => void;
  hint?: string;
  error?: string;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          type={visible ? 'text' : 'password'}
          autoComplete={autoComplete}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="rounded-(--radius-input) pr-10"
          required
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? 'Hide password' : 'Show password'}
          className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-text-muted transition-colors hover:text-text"
        >
          {visible ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
        </button>
      </div>
      {error ? (
        <p className="text-caption text-danger">{error}</p>
      ) : hint ? (
        <p className="text-caption text-text-muted">{hint}</p>
      ) : null}
    </div>
  );
}
