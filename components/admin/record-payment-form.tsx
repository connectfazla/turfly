'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { recordPaymentAction } from '@/app/actions/admin-bookings';
import { recordPaymentSchema, type RecordPaymentFormInput } from '@/lib/schemas/admin';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const METHODS = ['CASH', 'BKASH', 'NAGAD', 'BANK_TRANSFER', 'CARD', 'OTHER'] as const;

export function RecordPaymentForm({ bookingId }: { bookingId: string }) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const form = useForm<RecordPaymentFormInput>({
    resolver: zodResolver(recordPaymentSchema),
    defaultValues: { bookingId, amount: '' as unknown as number, method: 'CASH', note: '' },
  });

  async function onSubmit(values: RecordPaymentFormInput) {
    setServerError(null);
    const result = await recordPaymentAction({ ...values, bookingId });
    if (!result.ok) {
      setServerError(result.error);
      return;
    }
    form.reset({ bookingId, amount: '' as unknown as number, method: 'CASH', note: '' });
    router.refresh();
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="amount">Amount (BDT)</Label>
        <Input id="amount" type="number" step="1" min="1" className="w-32 rounded-(--radius-input)" {...form.register('amount')} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="method">Method</Label>
        <Select
          value={form.watch('method')}
          onValueChange={(v) => form.setValue('method', v as RecordPaymentFormInput['method'])}
        >
          <SelectTrigger id="method" className="w-36 rounded-(--radius-input)">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {METHODS.map((m) => (
              <SelectItem key={m} value={m}>
                {m.replace('_', ' ')}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="note">Note</Label>
        <Input id="note" className="w-40 rounded-(--radius-input)" {...form.register('note')} />
      </div>
      <Button type="submit" disabled={form.formState.isSubmitting}>
        {form.formState.isSubmitting ? 'Recording…' : 'Record payment'}
      </Button>
      {form.formState.errors.amount ? (
        <p className="w-full text-caption text-danger">{form.formState.errors.amount.message}</p>
      ) : null}
      {serverError ? (
        <p role="alert" className="w-full text-caption text-danger">
          {serverError}
        </p>
      ) : null}
    </form>
  );
}
