/**
 * Resolves "the field" when nothing else says which one — one layer below
 * lib/tenant.ts's getDefaultVenueId(): given a venue, which Field an
 * unqualified request means.
 *
 * Every venue has at least one active Field: scripts/backfill-fields.ts
 * guaranteed it for every venue that existed before this pass, and
 * lib/provisioning.ts's provisionTenant() creates one for every venue
 * onboarded since. This only throws if every one of a venue's fields has
 * been deactivated — not reachable today, since Field has no deactivate UI
 * yet, but a real state worth failing loudly on rather than silently
 * resolving to nothing.
 */
import type { Prisma, PrismaClient } from '@prisma/client';
import { prisma } from './prisma';

type DbClient = PrismaClient | Prisma.TransactionClient;

/** Lowest sortOrder first, ties broken by creation order — same ordering
 * getActiveFields() below uses, so "the default field" is always the first
 * one a customer or an owner would see on any picker/switcher too. */
export async function getDefaultFieldId(db: DbClient, venueId: string): Promise<string> {
  const field = await db.field.findFirst({
    where: { venueId, isActive: true },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    select: { id: true },
  });
  if (!field) throw new Error(`Venue ${venueId} has no active field.`);
  return field.id;
}

export interface FieldOption {
  id: string;
  name: string;
  sportName: string;
}

/** A venue's bookable fields — shared by the public field picker
 * (components/booking/field-picker.tsx) and the admin pricing page's field
 * selector, so "which fields exist and in what order" is answered once. */
export async function getActiveFields(venueId: string): Promise<FieldOption[]> {
  return prisma.field.findMany({
    where: { venueId, isActive: true },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    select: { id: true, name: true, sportName: true },
  });
}
