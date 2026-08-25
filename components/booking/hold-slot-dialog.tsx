'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { holdSlotAction } from '@/app/actions/bookings';
import { holdSlotSchema, type HoldSlotFormInput } from '@/lib/schemas/booking';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatBDT } from '@/lib/format';
import type { PublicSlotView } from './types';

export interface HoldSlotDialogProps {
  date: string; // yyyy-MM-dd
  /** Which field this slot belongs to (multi-field pass) — carried
   * straight through into the HELD row, same as date/slotIndex below. */
  fieldId: string;
  slot: PublicSlotView | null;
  onOpenChange: (open: boolean) => void;
}

/**
 * The slot-click step. Collects just enough (phone, name) to create the
 * HELD row — Customer.phone/fullName are required at the database level,
 * so a hold can't exist without them (CLAUDE.md §5). Everything else
 * (email, team, note) is collected on /book/confirm.
 */
export function HoldSlotDialog({ date, fieldId, slot, onOpenChange }: HoldSlotDialogProps) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);

  const form = useForm<HoldSlotFormInput>({
    resolver: zodResolver(holdSlotSchema),
    defaultValues: { date, fieldId, slotIndex: slot?.index ?? 0, phone: '', fullName: '' },
    values: slot ? { date, fieldId, slotIndex: slot.index, phone: '', fullName: '' } : undefined,
  });

  async function onSubmit(values: HoldSlotFormInput) {
    setServerError(null);
    const result = await holdSlotAction(values);
    if (!result.ok) {
      setServerError(result.error);
      return;
    }
    const params = new URLSearchParams({
      holdId: result.data.bookingId,
      date,
      slotIndex: String(slot?.index ?? 0),
    });
    router.push(`/book/confirm?${params.toString()}`);
  }

  return (
    <Dialog open={slot !== null} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-(--radius-card) sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-heading text-text">Reserve this slot</DialogTitle>
          <DialogDescription className="text-body text-text-muted">
            {slot ? (
              <>
                {slot.label}
                {slot.price !== null ? <> · {formatBDT(slot.price)}</> : null}. Held for you for 10
                minutes while you finish booking.
              </>
            ) : null}
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="flex flex-col gap-4"
          aria-describedby={serverError ? 'hold-slot-error' : undefined}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="fullName">Full name</Label>
            <Input
              id="fullName"
              autoComplete="name"
              className="rounded-(--radius-input)"
              {...form.register('fullName')}
            />
            {form.formState.errors.fullName ? (
              <p className="text-caption text-danger">{form.formState.errors.fullName.message}</p>
            ) : null}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="phone">Phone number</Label>
            <Input
              id="phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="01XXXXXXXXX"
              className="rounded-(--radius-input)"
              {...form.register('phone')}
            />
            {form.formState.errors.phone ? (
              <p className="text-caption text-danger">{form.formState.errors.phone.message}</p>
            ) : null}
          </div>

          {serverError ? (
            <p id="hold-slot-error" role="alert" className="text-caption text-danger">
              {serverError}
            </p>
          ) : null}

          <DialogFooter>
            <Button type="submit" disabled={form.formState.isSubmitting} className="w-full sm:w-auto">
              {form.formState.isSubmitting ? 'Holding…' : 'Hold this slot'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
