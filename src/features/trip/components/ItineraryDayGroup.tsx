import type { ItineraryItem } from '../../../lib/validation/schemas'
import { ItineraryEntryRow } from './ItineraryEntryRow'

/** One day's worth of itinerary stops, with an optional "Day N" heading. */
export function ItineraryDayGroup({
  day,
  entries,
  showHeading,
  onMove,
  onRemove,
}: {
  day: number
  entries: { item: ItineraryItem; index: number }[]
  showHeading: boolean
  onMove: (entries: { item: ItineraryItem; index: number }[], entryPos: number, direction: -1 | 1) => void
  onRemove: (index: number) => void
}) {
  return (
    <div className="chronicle-day-group">
      {showHeading && <h2 className="chronicle-day-heading">Day {day}</h2>}
      <ol>
        {entries.map(({ item, index }, entryPos) => (
          <ItineraryEntryRow
            key={`${item.time}-${item.text}-${index}`}
            item={item}
            isFirst={entryPos === 0}
            isLast={entryPos === entries.length - 1}
            onMoveEarlier={() => onMove(entries, entryPos, -1)}
            onMoveLater={() => onMove(entries, entryPos, 1)}
            onRemove={() => onRemove(index)}
          />
        ))}
      </ol>
    </div>
  )
}
