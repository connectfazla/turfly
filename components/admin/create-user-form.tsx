'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createUserAction } from '@/app/actions/users';
import { createUserSchema, type CreateUserFormInput } from '@/lib/schemas/admin';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export function CreateUserForm() {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);

  const form = useForm<CreateUserFormInput>({
    resolver: zodResolver(createUserSchema),
    defaultValues: { email: '', name: '', password: '', role: 'MODERATOR' },
  });

  async function onSubmit(values: CreateUserFormInput) {
    setServerError(null);
    const result = await createUserAction(values);
    if (!result.ok) {
      setServerError(result.error);
      return;
    }
    form.reset({ email: '', name: '', password: '', role: 'MODERATOR' });
    router.refresh();
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="userEmail">Email</Label>
        <Input id="userEmail" type="email" className="w-48 rounded-(--radius-input)" {...form.register('email')} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="userName">Name</Label>
        <Input id="userName" className="w-40 rounded-(--radius-input)" {...form.register('name')} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="userPassword">Password</Label>
        <Input id="userPassword" type="password" className="w-40 rounded-(--radius-input)" {...form.register('password')} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="userRole">Role</Label>
        <Select value={form.watch('role')} onValueChange={(v) => form.setValue('role', v as 'ADMIN' | 'MODERATOR')}>
          <SelectTrigger id="userRole" className="w-32 rounded-(--radius-input)">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="MODERATOR">Moderator</SelectItem>
            <SelectItem value="ADMIN">Admin</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Button type="submit" disabled={form.formState.isSubmitting}>
        {form.formState.isSubmitting ? 'Creating…' : 'Create user'}
      </Button>
      {(form.formState.errors.email || form.formState.errors.name || form.formState.errors.password) ? (
        <p className="w-full text-caption text-danger">
          {form.formState.errors.email?.message ?? form.formState.errors.name?.message ?? form.formState.errors.password?.message}
        </p>
      ) : null}
      {serverError ? (
        <p role="alert" className="w-full text-caption text-danger">
          {serverError}
        </p>
      ) : null}
    </form>
  );
}
