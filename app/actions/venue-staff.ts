/**
 * Venue-scoped staff management.
 *
 * An invite creates the grant and emails a link — it never sets anybody's
 * password. The invited person follows the link and chooses their own, which
 * means an owner can add staff without ever knowing their credentials, and a
 * User row that has been invited but not accepted CANNOT authenticate
 * (passwordHash stays null, and verifyPassword refuses a null hash).
 */
'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import type { VenueStaffRole } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireRole, ForbiddenError, UnauthorizedError } from '@/lib/auth/require-role';
import { issueToken } from '@/lib/auth/tokens';
import { sendAuthEmail } from '@/lib/notifications/auth-email';

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

const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email'),
  name: z.string().trim().min(2, 'Enter their name').max(80),
  role: z.enum(['MANAGER', 'BOOKIE']),
});

export async function inviteStaffAction(
  input: z.input<typeof inviteSchema>,
): Promise<ActionResult<{ email: string; emailed: boolean; alreadyHadAccount: boolean }>> {
  try {
    const owner = await requireRole('OWNER');
    const parsed = inviteSchema.parse(input);

    if (parsed.email === owner.email.toLowerCase()) {
      return { ok: false, error: 'You are already the owner of this venue.' };
    }

    const venue = await prisma.venue.findUnique({ where: { id: owner.venueId }, select: { name: true } });
    const venueName = venue?.name ?? 'the venue';

    // The grant is created whether or not the email goes out. Email is
    // best-effort; access is not. If delivery fails the owner can resend, and
    // the person can also just sign up with that exact address themselves.
    const { user, created } = await prisma.$transaction(async (tx) => {
      const user = await tx.user.upsert({
        where: { email: parsed.email },
        update: { name: parsed.name, isActive: true },
        create: { email: parsed.email, name: parsed.name },
      });

      const existing = await tx.venueStaff.findUnique({
        where: { venueId_userId: { venueId: owner.venueId, userId: user.id } },
        select: { id: true },
      });

      await tx.venueStaff.upsert({
        where: { venueId_userId: { venueId: owner.venueId, userId: user.id } },
        update: { role: parsed.role, isActive: true },
        create: {
          venueId: owner.venueId,
          tenantId: owner.tenantId,
          userId: user.id,
          role: parsed.role,
          invitedByUserId: owner.id,
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: owner.id,
          action: existing ? 'STAFF_ROLE_CHANGED' : 'STAFF_INVITED',
          entityType: 'VenueStaff',
          entityId: user.id,
          venueId: owner.venueId,
          tenantId: owner.tenantId,
          after: { email: parsed.email, role: parsed.role },
        },
      });

      return { user, created: !existing };
    });

    // Only send an invite link to someone who has no password yet. Emailing a
    // "set your password" link to an existing account would be a password
    // reset an owner could trigger for any address they can type — a real
    // account-takeover path, not a convenience.
    let emailed = false;
    const needsPassword = user.passwordHash === null;
    if (needsPassword) {
      const { token } = await issueToken(user.id, 'INVITE');
      const url = `${process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'}/accept-invite?token=${encodeURIComponent(token)}`;
      await sendAuthEmail({
        to: parsed.email,
        kind: 'INVITE',
        name: parsed.name,
        url,
        data: { venue: venueName, role: parsed.role === 'MANAGER' ? 'Manager' : 'Bookie', invitedBy: owner.name },
      });
      emailed = true;
    }

    revalidatePath('/admin/staff');
    return { ok: true, data: { email: parsed.email, emailed, alreadyHadAccount: !needsPassword } };
  } catch (err) {
    return fail(err);
  }
}

const setActiveSchema = z.object({ userId: z.string().min(1), isActive: z.boolean() });

export async function setStaffActiveAction(input: z.input<typeof setActiveSchema>): Promise<ActionResult<{ isActive: boolean }>> {
  try {
    const owner = await requireRole('OWNER');
    const { userId, isActive } = setActiveSchema.parse(input);

    // Self-lockout guard, carried over from the deleted users.ts. An owner
    // deactivating their own grant would not actually lock them out (ownership
    // is derived from the Tenant row, not a grant) but it is still incoherent
    // and worth refusing rather than silently no-op'ing.
    if (userId === owner.id) {
      return { ok: false, error: 'You cannot deactivate your own account.' };
    }

    const updated = await prisma.venueStaff.updateMany({
      where: { venueId: owner.venueId, userId },
      data: { isActive },
    });
    if (updated.count !== 1) return { ok: false, error: 'That staff member is not at this venue.' };

    await prisma.auditLog.create({
      data: {
        actorId: owner.id,
        action: isActive ? 'STAFF_REACTIVATED' : 'STAFF_DEACTIVATED',
        entityType: 'VenueStaff',
        entityId: userId,
        venueId: owner.venueId,
        tenantId: owner.tenantId,
      },
    });

    revalidatePath('/admin/staff');
    return { ok: true, data: { isActive } };
  } catch (err) {
    return fail(err);
  }
}

const changeRoleSchema = z.object({ userId: z.string().min(1), role: z.enum(['MANAGER', 'BOOKIE']) });

export async function changeStaffRoleAction(input: z.input<typeof changeRoleSchema>): Promise<ActionResult<{ role: VenueStaffRole }>> {
  try {
    const owner = await requireRole('OWNER');
    const { userId, role } = changeRoleSchema.parse(input);
    if (userId === owner.id) return { ok: false, error: 'You cannot change your own role.' };

    const before = await prisma.venueStaff.findUnique({
      where: { venueId_userId: { venueId: owner.venueId, userId } },
      select: { role: true },
    });
    if (!before) return { ok: false, error: 'That staff member is not at this venue.' };

    await prisma.venueStaff.update({
      where: { venueId_userId: { venueId: owner.venueId, userId } },
      data: { role },
    });

    await prisma.auditLog.create({
      data: {
        actorId: owner.id,
        action: 'STAFF_ROLE_CHANGED',
        entityType: 'VenueStaff',
        entityId: userId,
        venueId: owner.venueId,
        tenantId: owner.tenantId,
        before: { role: before.role },
        after: { role },
      },
    });

    revalidatePath('/admin/staff');
    return { ok: true, data: { role } };
  } catch (err) {
    return fail(err);
  }
}
