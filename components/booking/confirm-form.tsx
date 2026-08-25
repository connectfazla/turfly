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
import { formatBDT } from '@/lib/format';

export interface ConfirmFormProps {
  holdId: string;
  date: string;
  slotIndex: number;
  holdExpiresAt: string;
  priceAmount: string;
  /** Never empty — app/book/confirm/page.tsx renders a blocking notice
   * instead of this form at all when the venue has no bKash number set. */
  bkashNumber: string;
  /** Now computed as venue.depositPercent% of this booking's price
   * (VenueSetting's old fixed advanceAmount is retired — see
   * prisma/schema.prisma). */
  depositAmount: number;
}

export function ConfirmForm({
  holdId,
  date,
  slotIndex,
  holdExpiresAt,
  priceAmount,
  bkashNumber,
  depositAmount,
}: ConfirmFormProps) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);

  const form = useForm<ConfirmBookingFormInput>({
    resolver: zodResolver(confirmBookingSchema),
    defaultValues: {
      holdId,
      date,
      slotIndex,
      email: '',
      address: '',
      trxId: '',
      teamName: '',
      note: '',
    },
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

      {/* bKash advance instructions — read this before filling the form
          below, since the last field (trxId) needs the number you get
          back from sending this exact payment. Laid out for a one-thumb
          phone read: big number, big amount, numbered steps. */}
      <div className="flex flex-col gap-3 rounded-(--radius-card) border border-accent/30 bg-accent-soft p-4">
        <p className="text-subheading text-text">Pay the advance to confirm your slot</p>
        <p className="text-body text-text-muted">
          Send <span className="font-semibold text-text">{formatBDT(depositAmount)}</span> via bKash{' '}
          <span className="font-semibold text-text">Send Money</span> to:
        </p>
        <p className="select-all text-heading font-semibold tracking-wide text-accent" aria-label="bKash number">
          {bkashNumber}
        </p>
        <ol className="list-decimal space-y-1 pl-5 text-caption text-text-muted">
          <li>Open your bKash app and choose Send Money.</li>
          <li>Enter the number above and the exact amount shown.</li>
          <li>After sending, copy the Transaction ID (TRXN ID) from the confirmation screen.</li>
          <li>Paste it into the field below and submit.</li>
        </ol>
        <p className="text-caption text-text-muted">
          Total for this slot: {formatBDT(priceAmount)}. The rest is settled at the venue. Your booking
          stays reserved once you submit — staff verify the payment and confirm it, usually within a few
          hours.
        </p>
      </div>

      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="flex flex-col gap-4"
        aria-describedby={serverError ? 'confirm-error' : undefined}
      >
        <input type="hidden" {...form.register('holdId')} />
        <input type="hidden" {...form.register('date')} />
        <input type="hidden" {...form.register('slotIndex', { valueAsNumber: true })} />

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            className="rounded-(--radius-input)"
            {...form.register('email')}
          />
          {form.formState.errors.email ? (
            <p className="text-caption text-danger">{form.formState.errors.email.message}</p>
          ) : null}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="address">Address</Label>
          <Textarea
            id="address"
            rows={2}
            autoComplete="street-address"
            className="rounded-(--radius-input)"
            {...form.register('address')}
          />
          {form.formState.errors.address ? (
            <p className="text-caption text-danger">{form.formState.errors.address.message}</p>
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

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="trxId">bKash Transaction ID</Label>
          <Input
            id="trxId"
            autoComplete="off"
            autoCapitalize="characters"
            placeholder="e.g. 8N7A1B2C3D"
            className="rounded-(--radius-input) uppercase tracking-wide"
            {...form.register('trxId')}
          />
          {form.formState.errors.trxId ? (
            <p className="text-caption text-danger">{form.formState.errors.trxId.message}</p>
          ) : (
            <p className="text-caption text-text-muted">From the bKash confirmation screen or SMS.</p>
          )}
        </div>

        {serverError ? (
          <p id="confirm-error" role="alert" className="text-caption text-danger">
            {serverError}
          </p>
        ) : null}

        <Button type="submit" disabled={expired || form.formState.isSubmitting} className="w-full">
          {form.formState.isSubmitting ? 'Submitting…' : 'Submit for verification'}
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
