'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { loginSchema, type LoginFormInput } from '@/lib/schemas/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl') || '/admin';
  const [error, setError] = useState<string | null>(null);

  const form = useForm<LoginFormInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  async function onSubmit(values: LoginFormInput) {
    setError(null);
    const result = await signIn('credentials', { ...values, redirect: false });
    if (result?.error) {
      setError(
        result.error.includes('RATE_LIMITED')
          ? 'Too many attempts. Please try again in a few minutes.'
          : 'Invalid email or password.',
      );
      return;
    }
    router.push(callbackUrl);
    router.refresh();
  }

  return (
    <form
      onSubmit={form.handleSubmit(onSubmit)}
      className="flex flex-col gap-4"
      aria-describedby={error ? 'login-error' : undefined}
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          autoComplete="username"
          className="rounded-(--radius-input)"
          {...form.register('email')}
        />
        {form.formState.errors.email ? (
          <p className="text-caption text-danger">{form.formState.errors.email.message}</p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          className="rounded-(--radius-input)"
          {...form.register('password')}
        />
        {form.formState.errors.password ? (
          <p className="text-caption text-danger">{form.formState.errors.password.message}</p>
        ) : null}
      </div>

      {error ? (
        <p id="login-error" role="alert" className="text-caption text-danger">
          {error}
        </p>
      ) : null}

      <Button type="submit" disabled={form.formState.isSubmitting} className="w-full">
        {form.formState.isSubmitting ? 'Signing in…' : 'Sign in'}
      </Button>
    </form>
  );
}
