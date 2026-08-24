'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { updatePaymentSettingsAction } from '@/app/actions/pricing';
import { paymentSettingsSchema, type PaymentSettingsFormInput } from '@/lib/schemas/admin';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function PaymentSettingsForm({ current }: { current: PaymentSettingsFormInput }) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const form = useForm<PaymentSettingsFormInput>({
    resolver: zodResolver(paymentSettingsSchema),
    defaultValues: current,
  });

  async function onSubmit(values: PaymentSettingsFormInput) {
    setServerError(null);
    setSaved(false);
    const result = await updatePaymentSettingsAction(values);
    if (!result.ok) {
      setServerError(result.error);
      return;
    }
    setSaved(true);
    router.refresh();
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="flex max-w-md flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="bkashNumber">bKash number</Label>
        <Input
          id="bkashNumber"
          type="tel"
          inputMode="tel"
          placeholder="01XXXXXXXXX"
          className="w-48 rounded-(--radius-input)"
          {...form.register('bkashNumber')}
        />
        {form.formState.errors.bkashNumber ? (
          <p className="text-caption text-danger">{form.formState.errors.bkashNumber.message}</p>
        ) : (
          <p className="text-caption text-text-muted">
            Shown to customers on /book/confirm as the number to send the advance to.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="advanceAmount">Advance amount</Label>
        <div className="flex items-center gap-2">
          <Input
            id="advanceAmount"
            type="number"
            step="1"
            min="1"
            className="w-32 rounded-(--radius-input)"
            {...form.register('advanceAmount')}
          />
          <span className="text-caption text-text-muted">BDT</span>
        </div>
        {form.formState.errors.advanceAmount ? (
          <p className="text-caption text-danger">{form.formState.errors.advanceAmount.message}</p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="paymentVerificationHours">Verification window</Label>
        <div className="flex items-center gap-2">
          <Input
            id="paymentVerificationHours"
            type="number"
            step="1"
            min="1"
            max="168"
            className="w-32 rounded-(--radius-input)"
            {...form.register('paymentVerificationHours')}
          />
          <span className="text-caption text-text-muted">hours before an unverified claim auto-releases</span>
        </div>
        {form.formState.errors.paymentVerificationHours ? (
          <p className="text-caption text-danger">{form.formState.errors.paymentVerificationHours.message}</p>
        ) : null}
      </div>

      {serverError ? (
        <p role="alert" className="text-caption text-danger">
          {serverError}
        </p>
      ) : null}
      {saved ? <p className="text-caption text-accent">Saved.</p> : null}

      <Button type="submit" disabled={form.formState.isSubmitting} className="w-fit">
        {form.formState.isSubmitting ? 'Saving…' : 'Save payment settings'}
      </Button>
    </form>
  );
}
