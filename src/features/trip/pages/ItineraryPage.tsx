import { useMemo } from 'react'
import type { ItineraryItem } from '../../../lib/validation/schemas'
import { useTripContext } from '../useTripContext'
import { useItineraryActions } from '../hooks/useItineraryActions'
import { ItineraryStopForm } from '../components/ItineraryStopForm'
import { ItineraryDayGroup } from '../components/ItineraryDayGroup'

const TRIP_LENGTH_OPTIONS = Array.from({ length: 14 }, (_, i) => i + 1)

export function ItineraryPage() {
  const { trip } = useTripContext()
  const { itinerary, tripLengthDays, adding, addStop, removeStop, moveStop, setTripLength } = useItineraryActions(trip.id)

  const dayGroups = useMemo(() => {
    const groups = new Map<number, { item: ItineraryItem; index: number }[]>()
    itinerary.forEach((item, index) => {
      const day = item.day ?? 1
      if (!groups.has(day)) groups.set(day, [])
      groups.get(day)?.push({ item, index })
    })
    return [...groups.entries()].sort(([a], [b]) => a - b)
  }, [itinerary])

  return (
    <article className="chronicle-chapter">
      <div className="chronicle-itinerary-header">
        <h1 className="chronicle-timeline-heading">Itinerary</h1>
        <label className="chronicle-trip-length-control">
          <span>Trip length</span>
          <select
            value={tripLengthDays ?? ''}
            onChange={(e) => setTripLength(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">Not set</option>
            {TRIP_LENGTH_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n} {n === 1 ? 'day' : 'days'}
              </option>
            ))}
          </select>
        </label>
      </div>

      <ItineraryStopForm onSubmit={addStop} submitting={adding} />

      {itinerary.length === 0 ? (
        <p className="chronicle-rate-line">No stops yet — add one above, or add a suggestion from Things to Do.</p>
      ) : (
        dayGroups.map(([day, entries]) => (
          <ItineraryDayGroup key={day} day={day} entries={entries} showHeading={dayGroups.length > 1} onMove={moveStop} onRemove={removeStop} />
        ))
      )}
    </article>
  )
}
