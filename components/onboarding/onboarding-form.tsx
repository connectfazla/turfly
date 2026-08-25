'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { completeOnboardingAction, onboardingSchema, type OnboardingFormInput } from '@/app/actions/onboarding';
import { suggestSlug } from '@/lib/venue-slug';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

const DEFAULT_RULES =
  'One 90-minute slot per booking. Please arrive 10 minutes early. Cancellations are free up to 6 hours before your slot.';

export function OnboardingForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);
  /** True once the owner edits the address themselves — after that, typing in
   * the turf name stops overwriting what they chose. */
  const [slugTouched, setSlugTouched] = useState(false);

  const form = useForm<OnboardingFormInput>({
    resolver: zodResolver(onboardingSchema),
    defaultValues: {
      code: '',
      businessName: '',
      venueName: '',
      slug: '',
      contactPhone: '',
      contactEmail: '',
      rulesText: DEFAULT_RULES,
    },
  });

  const slug = form.watch('slug');

  function onVenueNameChange(value: string) {
    form.setValue('venueName', value);
    if (!slugTouched) form.setValue('slug', suggestSlug(value));
  }

  function onSubmit(values: OnboardingFormInput) {
    setServerError(null);
    startTransition(async () => {
      const result = await completeOnboardingAction(values);
      if (!result.ok) {
        if (result.field) {
          form.setError(result.field as keyof OnboardingFormInput, { message: result.error });
          // Focus the field that failed, rather than making the owner hunt
          // for it — the code and slug errors are the two likely ones and
          // both are recoverable.
          form.setFocus(result.field as keyof OnboardingFormInput);
        } else {
          setServerError(result.error);
        }
        return;
      }
      router.push('/admin');
      router.refresh();
    });
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="code">Registration code</Label>
        <Input
          id="code"
          autoComplete="off"
          spellCheck={false}
          placeholder="TURF-XXXXX-XXXXX"
          className="rounded-(--radius-input) font-mono tracking-wide uppercase"
          {...form.register('code')}
        />
        {form.formState.errors.code ? (
          <p className="text-caption text-danger">{form.formState.errors.code.message}</p>
        ) : (
          <p className="text-caption text-text-muted">The code we sent you. It works once.</p>
        )}
      </div>

      <hr className="border-border" />

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="businessName">Business name</Label>
        <Input
          id="businessName"
          className="rounded-(--radius-input)"
          placeholder="Rakib Sports Ltd."
          {...form.register('businessName')}
        />
        {form.formState.errors.businessName ? (
          <p className="text-caption text-danger">{form.formState.errors.businessName.message}</p>
        ) : (
          <p className="text-caption text-text-muted">Your company. Players never see this.</p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="venueName">Turf name</Label>
        <Input
          id="venueName"
          className="rounded-(--radius-input)"
          placeholder="Dhanmondi Turf"
          value={form.watch('venueName')}
          onChange={(e) => onVenueNameChange(e.target.value)}
        />
        {form.formState.errors.venueName ? (
          <p className="text-caption text-danger">{form.formState.errors.venueName.message}</p>
        ) : (
          <p className="text-caption text-text-muted">What players see when they book.</p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="slug">Booking address</Label>
        <div className="flex items-center gap-1.5">
          <Input
            id="slug"
            autoComplete="off"
            spellCheck={false}
            className="w-40 rounded-(--radius-input) font-mono"
            {...form.register('slug', { onChange: () => setSlugTouched(true) })}
          />
          <span className="text-body text-text-muted">.turfly.app</span>
        </div>
        {form.formState.errors.slug ? (
          <p className="text-caption text-danger">{form.formState.errors.slug.message}</p>
        ) : (
          <p className="text-caption text-text-muted">
            Players will book at{' '}
            <span className="font-mono text-text">{slug || 'your-turf'}.turfly.app</span>. Choose carefully — this
            ends up on your posters.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="contactPhone">Contact number</Label>
        <Input
          id="contactPhone"
          type="tel"
          inputMode="tel"
          className="w-56 rounded-(--radius-input)"
          placeholder="+8801XXXXXXXXX"
          {...form.register('contactPhone')}
        />
        {form.formState.errors.contactPhone ? (
          <p className="text-caption text-danger">{form.formState.errors.contactPhone.message}</p>
        ) : (
          <p className="text-caption text-text-muted">Shown to players who need to reach the turf.</p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="contactEmail">Contact email (optional)</Label>
        <Input
          id="contactEmail"
          type="email"
          className="rounded-(--radius-input)"
          placeholder="hello@yourturf.com"
          {...form.register('contactEmail')}
        />
        {form.formState.errors.contactEmail ? (
          <p className="text-caption text-danger">{form.formState.errors.contactEmail.message}</p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="rulesText">Rules for players</Label>
        <Textarea
          id="rulesText"
          rows={4}
          className="rounded-(--radius-input)"
          {...form.register('rulesText')}
        />
        {form.formState.errors.rulesText ? (
          <p className="text-caption text-danger">{form.formState.errors.rulesText.message}</p>
        ) : (
          <p className="text-caption text-text-muted">Edit these any time. We have filled in a sensible default.</p>
        )}
      </div>

      {serverError ? (
        <p role="alert" className="text-caption text-danger">
          {serverError}
        </p>
      ) : null}

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? 'Setting up your turf…' : 'Create my turf'}
      </Button>
      <p className="text-caption text-text-muted">
        Your bKash number and deposit percentage come next, from the dashboard.
      </p>
    </form>
  );
}
