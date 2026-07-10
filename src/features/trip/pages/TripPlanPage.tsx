import { useMemo, useState } from 'react'
import type { ItineraryItem } from '../../../lib/validation/schemas'
import { useTripContext } from '../useTripContext'
import { useItineraryActions } from '../hooks/useItineraryActions'
import { TripMap } from '../components/TripMap'
import { ItineraryStopForm } from '../components/ItineraryStopForm'
import { ItineraryDayGroup } from '../components/ItineraryDayGroup'
import { ThingsToDoList } from '../components/ThingsToDoList'
import { PlaceDetailPanel } from '../place/PlaceDetailPanel'
import { usePlaceDetail, type PlaceQuery } from '../place/usePlaceDetail'
import { placeQueryFor, placeQueryForThing } from '../place/placeQuery'

const TRIP_LENGTH_OPTIONS = Array.from({ length: 14 }, (_, i) => i + 1)

/**
 * The consolidated trip page: map, itinerary, and things-to-do in one place.
 * The map's day tabs drive the itinerary below it (toggle Day 1/2/3… to see
 * and edit that day's stops), and nearby places to add sit underneath. Clicking
 * a map pin or a place opens the detail panel. This replaces the separate
 * Itinerary, Map, and Things-to-do pages.
 */
export function TripPlanPage() {
  const { trip, location } = useTripContext()
  const { itinerary, tripLengthDays, adding, addStop, addFromThingToDo, removeStop, moveStop, setTripLength } = useItineraryActions(trip.id)
  const [selectedDay, setSelectedDay] = useState(1)
  const [selected, setSelected] = useState<PlaceQuery | null>(null)
  const { detail, loading, error } = usePlaceDetail(selected)

  const dayGroups = useMemo(() => {
    const groups = new Map<number, { item: ItineraryItem; index: number }[]>()
    itinerary.forEach((item, index) => {
      const day = item.day ?? 1
      if (!groups.has(day)) groups.set(day, [])
      groups.get(day)?.push({ item, index })
    })
    return groups
  }, [itinerary])

  const selectedEntries = dayGroups.get(selectedDay) ?? []

  if (!location) return <p>Loading…</p>

  return (
    <article className="chronicle-chapter chronicle-chapter--wide">
      <div className="chronicle-itinerary-header">
        <h1 className="chronicle-timeline-heading">Your trip</h1>
        <label className="chronicle-trip-length-control">
          <span>Trip length</span>
          <select
            value={tripLengthDays ?? ''}
            onChange={(e) => setTripLength(e.target.value ? Number(e.target.value) : null, location.thingsToDo)}
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

      <TripMap
        location={location}
        itinerary={itinerary}
        tripLengthDays={tripLengthDays}
        height={420}
        selectedDay={selectedDay}
        onSelectDay={setSelectedDay}
        onSelectMarker={(marker) =>
          setSelected(placeQueryFor({ name: marker.label, placeId: marker.placeId, lat: marker.lat, lng: marker.lng }))
        }
      />

      <section className="chronicle-plan-day" aria-label={`Day ${selectedDay} stops`} key={`${selectedDay}-${itinerary.length}`}>
        <h2 className="chronicle-weather-section-heading">Day {selectedDay}</h2>
        {selectedEntries.length > 0 ? (
          <ItineraryDayGroup day={selectedDay} entries={selectedEntries} showHeading={false} onMove={moveStop} onRemove={removeStop} />
        ) : (
          <p className="chronicle-rate-line">No stops on day {selectedDay} yet — add one below, or ask the chat.</p>
        )}
        <ItineraryStopForm onSubmit={addStop} submitting={adding} />
      </section>

      <section className="chronicle-map-places" aria-label="Things to do nearby">
        <h2 className="chronicle-weather-section-heading">Things to do nearby</h2>
        <ThingsToDoList
          thingsToDo={location.thingsToDo}
          onAdd={addFromThingToDo}
          onSelect={(item) => setSelected(placeQueryForThing(item))}
        />
      </section>

      {selected && (
        <PlaceDetailPanel query={selected} detail={detail} loading={loading} error={error} onClose={() => setSelected(null)} />
      )}
    </article>
  )
}
