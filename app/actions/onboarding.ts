/**
 * Owner onboarding: turns a registration code into a working business.
 *
 * The one place in the product where a stranger creates a tenant, so the
 * ordering here is deliberate and documented at each step.
 */
'use server';

import { headers } from 'next/headers';
import { auth, currentUser } from '@clerk/nextjs/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { clientIpFromHeaders, isRateLimited } from '@/lib/auth/rate-limit';
import {
  claimRegistrationCode,
  InvalidRegistrationCodeError,
  releaseRegistrationCode,
  normalizeRegistrationCode,
} from '@/lib/registration-code';
import { provisionTenant, isUniqueViolationOn } from '@/lib/provisioning';
import { assertSlugAllowed, InvalidSlugError } from '@/lib/venue-slug';
import { ensureClerkOrg } from '@/lib/clerk-org';

type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string; field?: string };

export const onboardingSchema = z.object({
  code: z.string().trim().min(1, 'Enter your registration code'),
  businessName: z.string().trim().min(2, 'Enter your business name').max(80),
  venueName: z.string().trim().min(2, 'Enter the turf name').max(80),
  slug: z.string().trim().toLowerCase().min(3).max(32),
  contactPhone: z
    .string()
    .trim()
    .regex(/^\+?[0-9\s-]{6,20}$/, 'Enter a valid phone number'),
  contactEmail: z.string().trim().toLowerCase().email('Enter a valid email').optional().or(z.literal('')),
  rulesText: z.string().trim().min(10, 'Write at least a sentence of rules').max(2000),
});

export type OnboardingFormInput = z.input<typeof onboardingSchema>;

export async function completeOnboardingAction(
  input: OnboardingFormInput,
): Promise<ActionResult<{ venueId: string; venueSlug: string; hasClerkOrg: boolean }>> {
  // 1. Must be a signed-in Clerk user. Sign-up itself is Clerk's job.
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) return { ok: false, error: 'Please sign in first.' };

  // 2. Rate limit BEFORE touching the code, so guessing codes is not free.
  const ip = clientIpFromHeaders(await headers());
  if (await isRateLimited(`regcode:${ip}`)) {
    return { ok: false, error: 'Too many attempts. Please wait a few minutes and try again.' };
  }

  const parsed = onboardingSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: issue?.message ?? 'Check the form and try again.', field: String(issue?.path[0] ?? '') };
  }

  // 3. Slug rules — reserved names and shape. Before the code is claimed, so
  //    a fixable typo never costs somebody their one-time code.
  try {
    assertSlugAllowed(parsed.data.slug);
  } catch (err) {
    if (err instanceof InvalidSlugError) return { ok: false, error: err.message, field: 'slug' };
    throw err;
  }

  const clerkUser = await currentUser();
  const primary = clerkUser?.emailAddresses.find((e) => e.id === clerkUser.primaryEmailAddressId);
  if (!primary || primary.verification?.status !== 'verified') {
    return { ok: false, error: 'Please verify your email address before setting up your turf.' };
  }
  const ownerEmail = primary.emailAddress.toLowerCase();
  const ownerName = [clerkUser?.firstName, clerkUser?.lastName].filter(Boolean).join(' ') || ownerEmail;

  // 4. Claim the code — atomic, single-winner, resumable (see
  //    lib/registration-code.ts).
  let claimed;
  try {
    claimed = await claimRegistrationCode(parsed.data.code, clerkUserId);
  } catch (err) {
    if (err instanceof InvalidRegistrationCodeError) {
      return { ok: false, error: 'That code is not valid, or has already been used.', field: 'code' };
    }
    throw err;
  }

  // 5. Provision. Everything that must be true together, in one transaction.
  try {
    const result = await provisionTenant(prisma, {
      clerkUserId,
      ownerName,
      ownerEmail,
      businessName: parsed.data.businessName,
      venueName: parsed.data.venueName,
      slug: parsed.data.slug,
      contactPhone: parsed.data.contactPhone,
      contactEmail: parsed.data.contactEmail || undefined,
      rulesText: parsed.data.rulesText,
      registrationCode: normalizeRegistrationCode(parsed.data.code),
    });

    // 6. AFTER the commit: the Clerk organization. Allowed to fail — the
    //    business is already fully usable without it (see lib/clerk-org.ts).
    const orgId = await ensureClerkOrg(result.tenantId);

    return {
      ok: true,
      data: { venueId: result.venueId, venueSlug: result.venueSlug, hasClerkOrg: orgId !== null },
    };
  } catch (err) {
    // Compensating release: provisioning failed, so the code must not stay
    // burned. Scoped to this claimant and to tenantId === null, so it can
    // never release a code that actually produced a business.
    await releaseRegistrationCode(normalizeRegistrationCode(parsed.data.code), clerkUserId);

    if (isUniqueViolationOn(err, 'slug')) {
      return { ok: false, error: 'That address is already taken. Please choose another.', field: 'slug' };
    }
    if (err instanceof Error && err.message === 'REGISTRATION_CODE_NO_LONGER_CLAIMABLE') {
      return { ok: false, error: 'That code is no longer valid. Please contact us for a new one.', field: 'code' };
    }
    console.error('[onboarding] provisioning failed:', err);
    return { ok: false, error: 'We could not finish setting up your turf. Please try again.' };
  }
}

/** Is this slug free? Used for live feedback on the form — advisory only, the
 * unique index is what actually decides. */
export async function checkSlugAvailableAction(slug: string): Promise<{ available: boolean; reason?: string }> {
  const normalized = slug.trim().toLowerCase();
  try {
    assertSlugAllowed(normalized);
  } catch (err) {
    return { available: false, reason: err instanceof InvalidSlugError ? err.message : 'Invalid address.' };
  }
  const taken = await prisma.venue.findUnique({ where: { slug: normalized }, select: { id: true } });
  return taken ? { available: false, reason: 'That address is already taken.' } : { available: true };
}
