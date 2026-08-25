/**
 * Owner-uploaded venue branding: a logo shown on the venue's public booking
 * page (components/site/header.tsx) and, eventually, wherever else a venue
 * identifies itself visually. `/admin/branding` is OWNER-only, same
 * reasoning as pricing/payment settings — this is a business-identity
 * decision, not something a Manager or Bookie makes.
 *
 * Storage is Vercel Blob (`@vercel/blob`), the natural fit for a Vercel
 * deployment: `put()` from inside a Server Action, no separate upload route,
 * no signed-URL dance. Requires `BLOB_READ_WRITE_TOKEN`, provisioned by
 * creating a Blob store in the Vercel dashboard and linking it to the
 * project — a one-time manual step, same shape as the Loops API key
 * (lib/notifications/auth-email.ts). Unlike email, there is no silent
 * fallback for a missing upload store: this action refuses clearly instead
 * of throwing a raw 500.
 */
'use server';

import { revalidatePath } from 'next/cache';
import { put, del } from '@vercel/blob';
import { prisma } from '@/lib/prisma';
import { requireRole } from '@/lib/auth/require-role';
import { venueLogoSchema } from '@/lib/schemas/admin';
import type { ActionResult } from './bookings';

function fail(error: unknown, fallback = 'Something went wrong. Please try again.'): ActionResult<never> {
  if (error instanceof Error && (error.name === 'UnauthorizedError' || error.name === 'ForbiddenError')) {
    return { ok: false, error: error.message, code: error.name };
  }
  if (error instanceof Error && error.name === 'ZodError') {
    return { ok: false, error: 'Please check the file and try again.' };
  }
  console.error(error);
  return { ok: false, error: fallback };
}

/**
 * `formData`, not a plain object — this is a file upload, and a native
 * `<form action={...}>` posting FormData is both the simplest way to send a
 * File to a Server Action and the one that still works without client JS.
 */
export async function updateVenueLogoAction(formData: FormData): Promise<ActionResult<{ url: string }>> {
  try {
    const staff = await requireRole('OWNER');

    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      // Refuse clearly rather than let @vercel/blob throw its own error —
      // this is a deployment-configuration gap, not something the owner
      // uploading a logo did wrong.
      return { ok: false, error: 'Logo uploads are not set up yet. Ask the platform operator to enable storage.' };
    }

    const parsed = venueLogoSchema.parse({ logo: formData.get('logo') });
    const { venueId } = staff;

    const before = await prisma.venue.findUniqueOrThrow({ where: { id: venueId }, select: { logoUrl: true } });

    const extension = parsed.logo.name.split('.').pop() ?? 'png';
    const blob = await put(`venue-logos/${venueId}/logo-${Date.now()}.${extension}`, parsed.logo, {
      access: 'public',
      addRandomSuffix: false,
    });

    await prisma.$transaction(async (tx) => {
      await tx.venue.update({ where: { id: venueId }, data: { logoUrl: blob.url } });
      await tx.auditLog.create({
        data: {
          actorId: staff.id,
          action: 'VENUE_LOGO_UPDATED',
          entityType: 'Venue',
          entityId: venueId,
          venueId,
          tenantId: staff.tenantId,
          before: { logoUrl: before.logoUrl },
          after: { logoUrl: blob.url },
        },
      });
    });

    // Best-effort: the DB write above is what actually matters, and has
    // already succeeded. A stray orphaned blob from a failed cleanup costs
    // a little storage, not correctness — never let it fail the request the
    // owner is waiting on.
    if (before.logoUrl) {
      await del(before.logoUrl).catch((err: unknown) => console.error('[branding] old logo cleanup failed:', err));
    }

    revalidatePath('/admin/branding');
    return { ok: true, data: { url: blob.url } };
  } catch (err) {
    return fail(err, 'Could not upload that image. Please try again.');
  }
}

/** Clears a venue's logo, reverting the public booking page to the
 * name-only header. Separate from updateVenueLogoAction rather than an
 * "empty file means remove" special case — an explicit action is a clearer
 * contract than an implicit one for a destructive-ish operation. */
export async function removeVenueLogoAction(): Promise<ActionResult<{ ok: true }>> {
  try {
    const staff = await requireRole('OWNER');
    const { venueId } = staff;

    const before = await prisma.venue.findUniqueOrThrow({ where: { id: venueId }, select: { logoUrl: true } });
    if (!before.logoUrl) return { ok: true, data: { ok: true } };

    await prisma.$transaction(async (tx) => {
      await tx.venue.update({ where: { id: venueId }, data: { logoUrl: null } });
      await tx.auditLog.create({
        data: {
          actorId: staff.id,
          action: 'VENUE_LOGO_REMOVED',
          entityType: 'Venue',
          entityId: venueId,
          venueId,
          tenantId: staff.tenantId,
          before: { logoUrl: before.logoUrl },
          after: { logoUrl: null },
        },
      });
    });

    if (process.env.BLOB_READ_WRITE_TOKEN) {
      await del(before.logoUrl).catch((err: unknown) => console.error('[branding] logo cleanup failed:', err));
    }

    revalidatePath('/admin/branding');
    return { ok: true, data: { ok: true } };
  } catch (err) {
    return fail(err);
  }
}
