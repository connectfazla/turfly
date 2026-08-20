'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createCounterBookingAction } from '@/app/actions/admin-bookings';
import { counterBookingSchema, type CounterBookingFormInput } from '@/lib/schemas/admin';
import { ALL_SLOT_INDEXES, slotLabel } from '@/lib/slots';
import { formatDateParam } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export function CounterBookingForm() {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const form = useForm<CounterBookingFormInput>({
    resolver: zodResolver(counterBookingSchema),
    defaultValues: {
      date: formatDateParam(new Date()),
      slotIndex: 0,
      phone: '',
      fullName: '',
      email: '',
      teamName: '',
      note: '',
    },
  });

  async function onSubmit(values: CounterBookingFormInput) {
    setServerError(null);
    setSuccess(null);
    const result = await createCounterBookingAction(values);
    if (!result.ok) {
      setServerError(result.error);
      return;
    }
    setSuccess(result.data.reference);
    form.reset({ ...values, phone: '', fullName: '', email: '', teamName: '', note: '' });
    router.refresh();
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="flex max-w-lg flex-col gap-4">
      <div className="flex gap-3">
        <div className="flex flex-1 flex-col gap-1.5">
          <Label htmlFor="date">Date</Label>
          <Input
            id="date"
            type="date"
            min={formatDateParam(new Date())}
            className="rounded-(--radius-input)"
            {...form.register('date')}
          />
        </div>
        <div className="flex flex-1 flex-col gap-1.5">
          <Label htmlFor="slotIndex">Slot</Label>
          <Select
            value={String(form.watch('slotIndex'))}
            onValueChange={(v) => form.setValue('slotIndex', Number(v))}
          >
            <SelectTrigger id="slotIndex" className="rounded-(--radius-input)">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ALL_SLOT_INDEXES.map((i) => (
                <SelectItem key={i} value={String(i)}>
                  {slotLabel(i)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="fullName">Full name</Label>
        <Input id="fullName" className="rounded-(--radius-input)" {...form.register('fullName')} />
        {form.formState.errors.fullName ? (
          <p className="text-caption text-danger">{form.formState.errors.fullName.message}</p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="phone">Phone</Label>
        <Input id="phone" placeholder="01XXXXXXXXX" className="rounded-(--radius-input)" {...form.register('phone')} />
        {form.formState.errors.phone ? (
          <p className="text-caption text-danger">{form.formState.errors.phone.message}</p>
        ) : null}
      </div>

      <div className="flex gap-3">
        <div className="flex flex-1 flex-col gap-1.5">
          <Label htmlFor="email">Email (optional)</Label>
          <Input id="email" type="email" className="rounded-(--radius-input)" {...form.register('email')} />
        </div>
        <div className="flex flex-1 flex-col gap-1.5">
          <Label htmlFor="teamName">Team (optional)</Label>
          <Input id="teamName" className="rounded-(--radius-input)" {...form.register('teamName')} />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="note">Note (optional)</Label>
        <Textarea id="note" rows={2} className="rounded-(--radius-input)" {...form.register('note')} />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="priceOverride">Price override (optional, BDT)</Label>
        <Input
          id="priceOverride"
          type="number"
          step="1"
          min="0"
          placeholder="Leave blank to use the standard rate"
          className="rounded-(--radius-input)"
          {...form.register('priceOverride', { valueAsNumber: true })}
        />
      </div>

      {serverError ? (
        <p role="alert" className="text-caption text-danger">
          {serverError}
        </p>
      ) : null}
      {success ? <p className="text-caption text-accent">Booked — reference {success}.</p> : null}

      <Button type="submit" disabled={form.formState.isSubmitting} className="w-fit">
        {form.formState.isSubmitting ? 'Booking…' : 'Create booking'}
      </Button>
    </form>
  );
}
