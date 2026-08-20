import type { SlotIndex, SlotState } from '@/lib/slots';

/** The slice of SlotView the client actually needs. Deliberately drops
 * startsAt/endsAt (Date objects) so the same shape works whether the data
 * came from the initial Server Component render or a polled JSON response
 * (where dates arrive as ISO strings) — the client never has to reconcile
 * two different representations of "when". */
export interface PublicSlotView {
  index: SlotIndex;
  label: string;
  state: SlotState;
  price: number | null;
}
