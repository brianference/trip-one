import type { ItineraryItem } from '../../../lib/validation/schemas'
import { ItineraryEntryRow } from './ItineraryEntryRow'
import { ExperienceCard } from './ExperienceCard'
import type { UseTripPhotosResult } from '../../photos/useTripPhotos'

/** True when this stop is a bookable paid experience (not an ordinary POI). */
function isExperienceStop(item: ItineraryItem): boolean {
  return item.source === 'viator' || Boolean(item.bookingUrl)
}

/** One day's worth of itinerary stops, with an optional "Day N" heading. */
export function ItineraryDayGroup({
  day,
  entries,
  showHeading,
  dayCount,
  onMove,
  onMoveToDay,
  onSetTime,
  onOpen,
  onRemove,
  photos,
  tripId,
  demoTrip,
}: {
  day: number
  entries: { item: ItineraryItem; index: number }[]
  showHeading: boolean
  dayCount: number
  onMove: (entries: { item: ItineraryItem; index: number }[], entryPos: number, direction: -1 | 1) => void
  onMoveToDay: (index: number, day: number) => void
  onSetTime: (index: number, time: string) => void
  onOpen?: (item: ItineraryItem) => void
  onRemove: (index: number) => void
  /** The trip's photos, grouped by stop, plus the actions each row's add/remove controls call. */
  photos: UseTripPhotosResult
  /** The trip these photos belong to, for building thumbnail URLs. */
  tripId: string
  /** True on read-only demo trips — hides each row's add-photo button. */
  demoTrip: boolean
}) {
  return (
    <div className="chronicle-day-group">
      {showHeading && <h2 className="chronicle-day-heading">Day {day}</h2>}
      <ol>
        {entries.map(({ item, index }, entryPos) =>
          isExperienceStop(item) ? (
            <li key={`${item.time}-${item.text}-${index}`} className="chronicle-entry chronicle-entry--experience">
              <ExperienceCard
                compact
                item={{
                  name: item.text,
                  rating: undefined,
                  numReviews: undefined,
                  priceFrom: item.priceFrom,
                  currency: item.currency,
                  durationMinutes: item.durationMinutes,
                  bookingUrl: item.bookingUrl,
                  freeCancellation: item.freeCancellation,
                }}
                onRemove={() => onRemove(index)}
              />
            </li>
          ) : (
            <ItineraryEntryRow
              key={item.id ?? `${item.time}-${item.text}-${index}`}
              item={item}
              position={entryPos}
              total={entries.length}
              isFirst={entryPos === 0}
              isLast={entryPos === entries.length - 1}
              dayCount={dayCount}
              onOpen={onOpen ? () => onOpen(item) : undefined}
              onMoveEarlier={() => onMove(entries, entryPos, -1)}
              onMoveLater={() => onMove(entries, entryPos, 1)}
              onMoveToDay={(d) => onMoveToDay(index, d)}
              onSetTime={(t) => onSetTime(index, t)}
              onRemove={() => onRemove(index)}
              stopPhotos={item.id ? (photos.byStop.get(item.id) ?? []) : []}
              uploadingPhoto={item.id ? photos.uploading.has(item.id) : false}
              onAddPhoto={item.id ? (file: File) => photos.upload(item.id as string, file) : undefined}
              onRemovePhoto={photos.remove}
              tripId={tripId}
              demoTrip={demoTrip}
            />
          ),
        )}
      </ol>
    </div>
  )
}
