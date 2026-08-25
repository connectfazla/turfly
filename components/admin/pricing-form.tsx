'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { updatePricingAction } from '@/app/actions/pricing';
import { pricingSchema, type PricingFormInput } from '@/lib/schemas/admin';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function PricingForm({ fieldId, current }: { fieldId: string; current: PricingFormInput }) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const form = useForm<PricingFormInput>({
    resolver: zodResolver(pricingSchema),
    defaultValues: current,
    values: current,
  });

  async function onSubmit(values: PricingFormInput) {
    setServerError(null);
    setSaved(false);
    const result = await updatePricingAction(fieldId, values);
    if (!result.ok) {
      setServerError(result.error);
      return;
    }
    setSaved(true);
    router.refresh();
  }

  const fields: { name: keyof PricingFormInput; label: string; hint: string }[] = [
    { name: 'noon', label: 'Noon', hint: 'Every day, 09:00–15:00' },
    { name: 'afternoon', label: 'Weekday afternoon', hint: 'Sun–Thu, early morning + evening/late night' },
    { name: 'weekendAfternoon', label: 'Weekend afternoon', hint: 'Fri–Sat, early morning + evening/late night' },
    { name: 'night', label: 'Weekday night', hint: 'Sun–Thu, 16:30–23:00' },
    { name: 'weekendNight', label: 'Weekend night', hint: 'Fri–Sat, 16:30–23:00' },
  ];

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="flex max-w-md flex-col gap-4">
      {fields.map((f) => (
        <div key={f.name} className="flex flex-col gap-1.5">
          <Label htmlFor={f.name}>{f.label}</Label>
          <div className="flex items-center gap-2">
            <Input id={f.name} type="number" step="1" min="1" className="w-32 rounded-(--radius-input)" {...form.register(f.name)} />
            <span className="text-caption text-text-muted">BDT · {f.hint}</span>
          </div>
        </div>
      ))}

      {serverError ? (
        <p role="alert" className="text-caption text-danger">
          {serverError}
        </p>
      ) : null}
      {saved ? <p className="text-caption text-accent">Saved. Applies to all future bookings.</p> : null}

      <Button type="submit" disabled={form.formState.isSubmitting} className="w-fit">
        {form.formState.isSubmitting ? 'Saving…' : 'Save pricing'}
      </Button>
    </form>
  );
}
