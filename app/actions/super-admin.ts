/**
 * Platform-operator actions. Every one of them calls requireSuperAdmin()
 * FIRST — the layout gating /super-admin/* is a convenience for rendering,
 * not authorisation, and Server Actions are reachable without ever loading
 * the page that hosts them (CLAUDE.md §7).
 */
'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSuperAdmin } from '@/lib/auth/require-super-admin';
import { ForbiddenError, UnauthorizedError } from '@/lib/auth/require-role';
import { generateRegistrationCode } from '@/lib/registration-code';

type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

function fail(error: unknown): { ok: false; error: string } {
  if (error instanceof UnauthorizedError) return { ok: false, error: 'You must be signed in.' };
  if (error instanceof ForbiddenError) return { ok: false, error: 'You do not have permission to do that.' };
  if (error instanceof z.ZodError) {
    return { ok: false, error: error.issues[0]?.message ?? 'Check the form and try again.' };
  }
  console.error(error);
  return { ok: false, error: 'Something went wrong. Please try again.' };
}

const issueCodeSchema = z.object({
  label: z.string().trim().max(120).optional().or(z.literal('')),
  issuedToEmail: z.string().trim().toLowerCase().email('Enter a valid email').optional().or(z.literal('')),
  /** Days until expiry. Omitted means never expires. */
  expiresInDays: z.coerce.number().int().min(1).max(365).optional(),
});

export async function issueRegistrationCodeAction(
  input: z.input<typeof issueCodeSchema>,
): Promise<ActionResult<{ display: string }>> {
  try {
    const admin = await requireSuperAdmin();
    const parsed = issueCodeSchema.parse(input);

    const { code, display } = generateRegistrationCode();
    const expiresAt = parsed.expiresInDays
      ? new Date(Date.now() + parsed.expiresInDays * 86_400_000)
      : null;

    await prisma.$transaction(async (tx) => {
      await tx.registrationCode.create({
        data: {
          code,
          display,
          label: parsed.label || null,
          issuedToEmail: parsed.issuedToEmail || null,
          createdByUserId: admin.userId,
          expiresAt,
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: admin.userId,
          action: 'REGISTRATION_CODE_ISSUED',
          entityType: 'RegistrationCode',
          entityId: code,
          // The code itself is NOT recorded in the audit payload — an audit
          // log is readable by more people than should be able to redeem a
          // pending code. The entityId is enough to correlate.
          after: { display, label: parsed.label || null, expiresAt: expiresAt?.toISOString() ?? null },
        },
      });
    });

    revalidatePath('/super-admin/codes');
    return { ok: true, data: { display } };
  } catch (err) {
    return fail(err);
  }
}

const revokeCodeSchema = z.object({ code: z.string().trim().min(1) });

export async function revokeRegistrationCodeAction(
  input: z.input<typeof revokeCodeSchema>,
): Promise<ActionResult<{ ok: true }>> {
  try {
    const admin = await requireSuperAdmin();
    const { code } = revokeCodeSchema.parse(input);

    // `tenantId: null` in the WHERE is the guard that matters: revoking a code
    // that already produced a business would be a lie, since revoking does not
    // make the business go away. Enforced here rather than by reading the row
    // first, so a concurrent onboarding completing between read and write
    // cannot slip past.
    const revoked = await prisma.registrationCode.updateMany({
      where: { code, tenantId: null, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (revoked.count !== 1) {
      return { ok: false, error: 'That code cannot be revoked — it has already been used or revoked.' };
    }

    await prisma.auditLog.create({
      data: {
        actorId: admin.userId,
        action: 'REGISTRATION_CODE_REVOKED',
        entityType: 'RegistrationCode',
        entityId: code,
      },
    });

    revalidatePath('/super-admin/codes');
    return { ok: true, data: { ok: true } };
  } catch (err) {
    return fail(err);
  }
}

const setVenueActiveSchema = z.object({ venueId: z.string().min(1), isActive: z.boolean() });

/** Deactivating a venue hides it from its own staff — accessibleVenueIds()
 * only ever returns active venues — which is what makes this switch mean
 * something rather than being cosmetic. */
export async function setVenueActiveAction(
  input: z.input<typeof setVenueActiveSchema>,
): Promise<ActionResult<{ isActive: boolean }>> {
  try {
    const admin = await requireSuperAdmin();
    const { venueId, isActive } = setVenueActiveSchema.parse(input);

    const before = await prisma.venue.findUnique({ where: { id: venueId }, select: { isActive: true } });
    if (!before) return { ok: false, error: 'That venue no longer exists.' };

    const venue = await prisma.venue.update({ where: { id: venueId }, data: { isActive } });
    await prisma.auditLog.create({
      data: {
        actorId: admin.userId,
        action: isActive ? 'VENUE_ACTIVATED' : 'VENUE_DEACTIVATED',
        entityType: 'Venue',
        entityId: venueId,
        venueId,
        tenantId: venue.tenantId,
        before: { isActive: before.isActive },
        after: { isActive },
      },
    });

    revalidatePath('/super-admin/tenants');
    return { ok: true, data: { isActive } };
  } catch (err) {
    return fail(err);
  }
}
