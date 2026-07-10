import { useEffect, useMemo, useState } from 'react'
import type { ItineraryItem } from '../../../lib/validation/schemas'
import { useTripContext } from '../useTripContext'
import { useTripStore } from '../../../store/tripStore'
import { useItineraryActions } from '../hooks/useItineraryActions'
import { dayHeading } from '../../../lib/itinerary/tripDates'
import { dayEffort, formatEffort } from '../../../lib/itinerary/dayEffort'
import { daySummary, daySummaryChips } from '../../../lib/itinerary/daySummary'
import { TripMap } from '../components/TripMap'
import { ItineraryStopForm } from '../components/ItineraryStopForm'
import { ItineraryDayGroup } from '../components/ItineraryDayGroup'
import { ThingsToDoList } from '../components/ThingsToDoList'
import { TripSkeleton } from '../components/TripSkeleton'
import { TripExport } from '../components/TripExport'
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
  const startDate = useTripStore((s) => s.startDate)
  const { itinerary, tripLengthDays, adding, addStop, addFromThingToDo, addToDay, removeStop, moveStop, moveToDay, setStopTime, setTripLength, setStartDate } =
    useItineraryActions(trip.id)
  const [selectedDay, setSelectedDay] = useState(1)
  const [selected, setSelected] = useState<PlaceQuery | null>(null)
  const [mapFocus, setMapFocus] = useState<{ lat: number; lng: number; nonce: number } | null>(null)
  const { detail, loading, error } = usePlaceDetail(selected)

  // Reveal a stop or a place tapped in the map / a chat "Added" chip.
  const focusStop = (item: { text?: string; name?: string; lat?: number; lng?: number; category?: string }) => {
    const name = item.text ?? item.name ?? ''
    setSelected(placeQueryFor({ name, lat: item.lat, lng: item.lng, category: item.category }))
    if (item.lat != null && item.lng != null) setMapFocus({ lat: item.lat, lng: item.lng, nonce: Date.now() })
  }

  // A chat "Added …" chip (or any focus request) reveals the place here.
  const focusPlace = useTripStore((s) => s.focusPlace)
  const clearFocusPlace = useTripStore((s) => s.clearFocusPlace)
  useEffect(() => {
    if (!focusPlace) return
    if (focusPlace.day) setSelectedDay(focusPlace.day)
    setSelected(placeQueryFor({ name: focusPlace.name, lat: focusPlace.lat, lng: focusPlace.lng, category: focusPlace.category }))
    if (focusPlace.lat != null && focusPlace.lng != null) setMapFocus({ lat: focusPlace.lat, lng: focusPlace.lng, nonce: focusPlace.nonce })
    clearFocusPlace()
  }, [focusPlace, clearFocusPlace])

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
  const effort = dayEffort(selectedEntries.map((e) => e.item))
  const summaryChips = daySummaryChips(daySummary(selectedEntries.map((e) => e.item)))
  const dayCount = tripLengthDays && tripLengthDays > 1 ? tripLengthDays : 1
  // Names already on the plan (to badge things-to-do and drive the detail sheet's add/remove state).
  const plannedNames = useMemo(() => new Set(itinerary.map((it) => it.text)), [itinerary])
  const onPlanIndex = selected ? itinerary.findIndex((it) => it.text === (selected.name ?? selected.label)) : -1

  if (!location) return <TripSkeleton />

  return (
    <article className="chronicle-chapter chronicle-chapter--wide">
      {/* Print-only header: destination + dates, so a printed/PDF itinerary is labeled. */}
      <p className="chronicle-print-title">
        {location.displayName}
        {startDate ? ` · from ${startDate}` : ''}
      </p>
      <div className="chronicle-itinerary-header">
        <h1 className="chronicle-timeline-heading">Your trip</h1>
        <div className="chronicle-trip-controls">
          <label className="chronicle-trip-length-control">
            <span>Start date</span>
            <input type="date" value={startDate ?? ''} onChange={(e) => setStartDate(e.target.value || null)} />
          </label>
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
        <TripExport itinerary={itinerary} startDate={startDate} destinationName={location.displayName} />
      </div>

      <TripMap
        location={location}
        itinerary={itinerary}
        tripLengthDays={tripLengthDays}
        height={420}
        selectedDay={selectedDay}
        onSelectDay={setSelectedDay}
        onSelectMarker={(marker) =>
          setSelected(placeQueryFor({ name: marker.label, placeId: marker.placeId, lat: marker.lat, lng: marker.lng, category: marker.category }))
        }
        focusLatLng={mapFocus}
      />

      <section className="chronicle-plan-day" aria-label={`Day ${selectedDay} stops`} key={`${selectedDay}-${itinerary.length}`}>
        <h2 className="chronicle-weather-section-heading">{dayHeading(startDate, selectedDay)}</h2>
        {summaryChips.length > 0 && (
          <div className="chronicle-day-chips" aria-label="Day summary">
            {summaryChips.map((chip) => (
              <span key={chip.key} className={`chronicle-day-chip chronicle-day-chip--${chip.key}`}>
                {chip.label}
              </span>
            ))}
          </div>
        )}
        {effort && (
          <p className={`chronicle-day-effort${effort.crossTown ? ' chronicle-day-effort--warn' : ''}`}>
            {formatEffort(effort)}
            {effort.crossTown && ' · spread across town — consider splitting'}
          </p>
        )}
        {selectedEntries.length > 0 ? (
          <ItineraryDayGroup
            day={selectedDay}
            entries={selectedEntries}
            showHeading={false}
            dayCount={dayCount}
            onMove={moveStop}
            onMoveToDay={moveToDay}
            onSetTime={setStopTime}
            onOpen={(item) => focusStop(item)}
            onRemove={removeStop}
          />
        ) : (
          <p className="chronicle-rate-line">No stops on day {selectedDay} yet — add one below, or ask the chat.</p>
        )}
        <ItineraryStopForm onSubmit={addStop} submitting={adding} />
      </section>

      <section className="chronicle-map-places" aria-label="Things to do nearby">
        <h2 className="chronicle-weather-section-heading">Things to do nearby</h2>
        <ThingsToDoList
          thingsToDo={location.thingsToDo}
          plannedNames={plannedNames}
          onAdd={addFromThingToDo}
          onSelect={(item) => setSelected(placeQueryForThing(item))}
        />
      </section>

      {/* Full multi-day itinerary, hidden on screen and shown only when printing
          (the interactive view above shows one day at a time). */}
      <div className="chronicle-print-itinerary" aria-hidden="true">
        {[...dayGroups.entries()]
          .sort(([a], [b]) => a - b)
          .map(([day, entries]) => (
            <section key={day}>
              <h2>{dayHeading(startDate, day)}</h2>
              <ul>
                {entries.map(({ item }, i) => (
                  <li key={`${item.text}-${i}`}>
                    {item.time?.trim() ? <span className="chronicle-print-time">{item.time}</span> : null}
                    {item.text}
                  </li>
                ))}
              </ul>
            </section>
          ))}
      </div>

      {selected && (
        <PlaceDetailPanel
          query={selected}
          detail={detail}
          loading={loading}
          error={error}
          onClose={() => setSelected(null)}
          dayCount={dayCount}
          defaultDay={selectedDay}
          onPlanDay={onPlanIndex >= 0 ? itinerary[onPlanIndex].day ?? 1 : null}
          onAddToDay={(day) => {
            addToDay({ name: selected.name ?? selected.label, lat: selected.lat, lng: selected.lng, category: selected.category }, day)
            setSelected(null)
          }}
          onRemoveFromPlan={onPlanIndex >= 0 ? () => { removeStop(onPlanIndex); setSelected(null) } : undefined}
        />
      )}
    </article>
  )
}
