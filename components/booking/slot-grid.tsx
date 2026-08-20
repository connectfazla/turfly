'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { SlotCard } from './slot-card';
import { HoldSlotDialog } from './hold-slot-dialog';
import type { PublicSlotView } from './types';

const POLL_INTERVAL_MS = 30_000;

export interface SlotGridProps {
  date: string; // yyyy-MM-dd
  initialSlots: PublicSlotView[];
}

/**
 * Renders all 16 positions always (CLAUDE.md §6) in a 4/2/1-column grid.
 * First paint comes from the server (initialSlots, no client fetch
 * waterfall); after mount it polls /api/availability every 30s so the grid
 * stays fresh if someone else books a slot.
 */
export function SlotGrid({ date, initialSlots }: SlotGridProps) {
  const [slots, setSlots] = useState(initialSlots);
  const [selected, setSelected] = useState<PublicSlotView | null>(null);
  const router = useRouter();
  // Re-sync local state whenever the server gives us fresh initialSlots
  // (e.g. navigating to a different date).
  const lastDate = useRef(date);
  if (lastDate.current !== date) {
    lastDate.current = date;
    setSlots(initialSlots);
  }

  useEffect(() => {
    let cancelled = false;
    const id = setInterval(async () => {
      try {
        const res = await fetch(`/api/availability?date=${date}`, { cache: 'no-store' });
        if (!res.ok || cancelled) return;
        const body = (await res.json()) as { slots: PublicSlotView[] };
        if (!cancelled) setSlots(body.slots);
      } catch {
        // Transient network hiccup — next poll will retry. Nothing to
        // surface to the user for a background refresh.
      }
    }, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [date]);

  return (
    <>
      <div
        role="list"
        aria-label={`Slots for ${date}`}
        className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"
      >
        {slots.map((slot) => (
          <div role="listitem" key={slot.index}>
            <SlotCard slot={slot} onSelect={setSelected} />
          </div>
        ))}
      </div>

      <HoldSlotDialog
        date={date}
        slot={selected}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
          router.refresh();
        }}
      />
    </>
  );
}
