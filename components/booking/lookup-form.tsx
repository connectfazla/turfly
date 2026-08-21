'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { lookupBookingAction, cancelBookingPublicAction, type PublicBookingSummary } from '@/app/actions/bookings';
import { lookupBookingSchema, type LookupBookingFormInput } from '@/lib/schemas/booking';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatBDT, formatDateLong } from '@/lib/format';
import { slotLabel, type SlotIndex } from '@/lib/slots';

export function LookupForm() {
  const [serverError, setServerError] = useState<string | null>(null);
  const [result, setResult] = useState<PublicBookingSummary | null>(null);
  const [cancelState, setCancelState] = useState<'idle' | 'confirming' | 'done'>('idle');
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [phone, setPhone] = useState('');

  const form = useForm<LookupBookingFormInput>({
    resolver: zodResolver(lookupBookingSchema),
    defaultValues: { reference: '', phone: '' },
  });

  async function onSubmit(values: LookupBookingFormInput) {
    setServerError(null);
    setResult(null);
    setCancelState('idle');
    const res = await lookupBookingAction(values);
    if (!res.ok) {
      setServerError(res.error);
      return;
    }
    setPhone(values.phone);
    setResult(res.data);
  }

  async function onCancel() {
    if (!result) return;
    setCancelError(null);
    const res = await cancelBookingPublicAction({ reference: result.reference, phone, reason: '' });
    if (!res.ok) {
      setCancelError(res.error);
      return;
    }
    setCancelState('done');
  }

  return (
    <div className="flex flex-col gap-6">
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="reference">Booking reference</Label>
          <Input
            id="reference"
            placeholder="TRF-2026-0001"
            className="rounded-(--radius-input) uppercase"
            {...form.register('reference')}
          />
          {form.formState.errors.reference ? (
            <p className="text-caption text-danger">{form.formState.errors.reference.message}</p>
          ) : null}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="phone">Phone number</Label>
          <Input
            id="phone"
            type="tel"
            inputMode="tel"
            placeholder="01XXXXXXXXX"
            className="rounded-(--radius-input)"
            {...form.register('phone')}
          />
          {form.formState.errors.phone ? (
            <p className="text-caption text-danger">{form.formState.errors.phone.message}</p>
          ) : null}
        </div>

        {serverError ? (
          <p role="alert" className="text-caption text-danger">
            {serverError}
          </p>
        ) : null}

        <Button type="submit" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? 'Looking up…' : 'Find booking'}
        </Button>
      </form>

      {result ? (
        <Card className="rounded-(--radius-card)">
          <CardHeader>
            <CardTitle className="text-heading text-text">{result.reference}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-body text-text">
            <div className="flex justify-between">
              <span className="text-text-muted">Date</span>
              <span>{formatDateLong(new Date(result.date))}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-muted">Time</span>
              <span className="tabular-nums">{slotLabel(result.slotIndex as SlotIndex)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-muted">Price</span>
              <span className="tabular-nums">{formatBDT(result.priceAmount)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-muted">Status</span>
              <span>{result.status}</span>
            </div>

            {cancelState === 'done' ? (
              <p className="text-caption text-accent">This booking has been cancelled.</p>
            ) : result.canCancelOnline ? (
              cancelState === 'confirming' ? (
                <div className="flex flex-col gap-2 rounded-(--radius-card) border border-danger/30 bg-surface-muted p-3">
                  <p className="text-caption text-text">Cancel this booking? This can&apos;t be undone.</p>
                  {cancelError ? <p className="text-caption text-danger">{cancelError}</p> : null}
                  <div className="flex gap-2">
                    <Button type="button" variant="destructive" onClick={onCancel}>
                      Yes, cancel
                    </Button>
                    <Button type="button" variant="outline" onClick={() => setCancelState('idle')}>
                      Keep booking
                    </Button>
                  </div>
                </div>
              ) : (
                <Button type="button" variant="destructive" onClick={() => setCancelState('confirming')}>
                  Cancel booking
                </Button>
              )
            ) : result.status === 'CONFIRMED' ? (
              <p className="text-caption text-text-muted">
                This booking starts within 6 hours. Please contact the venue to cancel.
              </p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
