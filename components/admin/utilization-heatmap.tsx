import { BOOKABLE_SLOT_INDEXES, slotLabel, type SlotIndex } from '@/lib/slots';
import type { HeatMapCell } from '@/lib/reports';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Slot index (rows) x day of week (columns). Colour intensity is a
 * secondary cue only — every cell also prints its count, so the pattern
 * reads even in greyscale (CLAUDE.md §6: state is never colour-only). */
export function UtilizationHeatmap({ cells }: { cells: HeatMapCell[] }) {
  const maxCount = Math.max(1, ...cells.map((c) => c.count));
  const byKey = new Map(cells.map((c) => [`${c.dayOfWeek}-${c.slotIndex}`, c.count]));

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-caption">
        <thead>
          <tr>
            <th className="p-1 text-left font-normal text-text-muted">Slot</th>
            {DAY_LABELS.map((d) => (
              <th key={d} className="p-1 text-center font-normal text-text-muted">
                {d}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {BOOKABLE_SLOT_INDEXES.map((slotIndex) => (
            <tr key={slotIndex}>
              <td className="whitespace-nowrap p-1 tabular-nums text-text-muted">{slotLabel(slotIndex as SlotIndex)}</td>
              {DAY_LABELS.map((_, dayOfWeek) => {
                const count = byKey.get(`${dayOfWeek}-${slotIndex}`) ?? 0;
                const intensity = count / maxCount;
                return (
                  <td key={dayOfWeek} className="p-1 text-center">
                    <div
                      className="mx-auto flex h-8 w-10 items-center justify-center rounded-(--radius-input) tabular-nums text-text"
                      style={{
                        backgroundColor: count === 0 ? '#F9FAFB' : `rgba(21, 128, 61, ${0.12 + intensity * 0.68})`,
                        color: intensity > 0.55 ? '#FFFFFF' : '#111827',
                      }}
                      title={`${DAY_LABELS[dayOfWeek]} ${slotLabel(slotIndex as SlotIndex)}: ${count} booking${count === 1 ? '' : 's'}`}
                    >
                      {count}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
