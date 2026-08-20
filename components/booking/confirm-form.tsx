'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { confirmBookingAction } from '@/app/actions/bookings';
import { confirmBookingSchema, type ConfirmBookingFormInput } from '@/lib/schemas/booking';
import { HoldTimer } from './hold-timer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

export interface ConfirmFormProps {
  holdId: string;
  date: string;
  slotIndex: number;
  holdExpiresAt: string;
}

export function ConfirmForm({ holdId, date, slotIndex, holdExpiresAt }: ConfirmFormProps) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);

  const form = useForm<ConfirmBookingFormInput>({
    resolver: zodResolver(confirmBookingSchema),
    defaultValues: { holdId, date, slotIndex, email: '', teamName: '', note: '' },
  });

  async function onSubmit(values: ConfirmBookingFormInput) {
    setServerError(null);
    const result = await confirmBookingAction(values);
    if (!result.ok) {
      setServerError(result.error);
      if (result.code === 'HOLD_EXPIRED') setExpired(true);
      return;
    }
    router.push(`/book/success/${result.data.reference}`);
  }

  return (
    <div className="mt-6 flex flex-col gap-6">
      <HoldTimer expiresAt={holdExpiresAt} onExpire={() => setExpired(true)} />

      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="flex flex-col gap-4"
        aria-describedby={serverError ? 'confirm-error' : undefined}
      >
        <input type="hidden" {...form.register('holdId')} />
        <input type="hidden" {...form.register('date')} />
        <input type="hidden" {...form.register('slotIndex', { valueAsNumber: true })} />

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email">Email (optional)</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            className="rounded-(--radius-input)"
            {...form.register('email')}
          />
          {form.formState.errors.email ? (
            <p className="text-caption text-danger">{form.formState.errors.email.message}</p>
          ) : null}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="teamName">Team name (optional)</Label>
          <Input id="teamName" className="rounded-(--radius-input)" {...form.register('teamName')} />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="note">Note for the venue (optional)</Label>
          <Textarea id="note" rows={3} className="rounded-(--radius-input)" {...form.register('note')} />
        </div>

        {serverError ? (
          <p id="confirm-error" role="alert" className="text-caption text-danger">
            {serverError}
          </p>
        ) : null}

        <Button type="submit" disabled={expired || form.formState.isSubmitting} className="w-full">
          {form.formState.isSubmitting ? 'Confirming…' : 'Confirm booking'}
        </Button>

        {expired ? (
          <p className="text-caption text-text-muted">
            <a href={`/book/${date}`} className="text-accent underline">
              Pick a slot again
            </a>
          </p>
        ) : null}
      </form>
    </div>
  );
}
