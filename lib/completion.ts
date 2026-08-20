/**
 * CONFIRMED -> COMPLETED happens when "end time passed + checked in"
 * (CLAUDE.md §5) — there's no cron in a project this size, so this sweep
 * runs opportunistically at the top of the admin read paths that display
 * booking status (dashboard, bookings list), the same pattern
 * booking-engine.ts uses for expired holds. The candidate set (CONFIRMED +
 * checked in) is always small for a single-field venue, so filtering "is
 * the slot over yet" in JS (via lib/slots.ts) rather than in raw SQL date
 * arithmetic keeps this on the same TZ-safe footing as the rest of the app.
 */
import { prisma } from './prisma';
import { slotEnd, type SlotIndex } from './slots';

export async function sweepDueCompletions(now: Date = new Date()): Promise<void> {
  const candidates = await prisma.booking.findMany({
    where: { status: 'CONFIRMED', checkedInAt: { not: null } },
    select: { id: true, date: true, slotIndex: true },
  });

  const dueIds = candidates
    .filter((b) => slotEnd(b.date, b.slotIndex as SlotIndex).getTime() <= now.getTime())
    .map((b) => b.id);

  if (dueIds.length > 0) {
    await prisma.booking.updateMany({ where: { id: { in: dueIds } }, data: { status: 'COMPLETED' } });
  }
}
