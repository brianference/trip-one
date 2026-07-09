import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import type { ItineraryItem } from '../../../lib/validation/schemas'
import { useTripContext } from '../useTripContext'
import { useItineraryActions } from '../hooks/useItineraryActions'
import { useTripChat } from '../chat/useTripChat'
import { TripChatPanel } from '../chat/TripChatPanel'
import { createTripForDestination } from '../planning/createTripForDestination'
import { stashOpeningChat } from '../chat/chatHandoff'
import { ItineraryStopForm } from '../components/ItineraryStopForm'
import { ItineraryDayGroup } from '../components/ItineraryDayGroup'

const TRIP_LENGTH_OPTIONS = Array.from({ length: 14 }, (_, i) => i + 1)

/**
 * The itinerary page: a persistent AI chat rail on the left (build and refine
 * the trip in plain language) and the day-by-day itinerary on the right.
 * The chat re-plans grounded on the trip's real nearby places; manual
 * add/remove/reorder still work on the right for fine edits.
 */
export function ItineraryPage() {
  const { trip, location } = useTripContext()
  const navigate = useNavigate()
  const { itinerary, tripLengthDays, adding, addStop, removeStop, moveStop, setTripLength, applyPlan } = useItineraryActions(trip.id)

  const places = location?.thingsToDo ?? []

  // When the chat detects a different destination, build a fresh trip there and
  // navigate to it, seeding its chat with the acknowledgement so the switch is
  // continuous.
  async function handleRelocate(destination: string, interests: string) {
    const built = await createTripForDestination(destination, interests, tripLengthDays)
    const now = Date.now()
    stashOpeningChat(built.tripId, [
      {
        id: `open-ai-${now}`,
        role: 'assistant',
        text: built.message || `Here’s a ${built.days}-day trip to ${built.destinationName}. Tell me what to change.`,
        ts: now,
      },
    ])
    navigate(`/trip/${built.tripId}/itinerary`)
  }

  const chat = useTripChat(trip.id, places, tripLengthDays ?? 3, location?.displayName, applyPlan, handleRelocate)

  function handleTripLengthChange(newLength: number | null) {
    setTripLength(newLength, places)
  }

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
    <div className="chronicle-itinerary-layout">
      <aside className="chronicle-itinerary-chat-col">
        <TripChatPanel
          messages={chat.messages}
          isThinking={chat.isThinking}
          error={chat.error}
          disabled={places.length === 0}
          onSend={(text) => void chat.send(text, itinerary)}
          locationName={location?.displayName}
        />
      </aside>

      <article className="chronicle-chapter chronicle-itinerary-main">
        <div className="chronicle-itinerary-header">
          <h1 className="chronicle-timeline-heading">Itinerary</h1>
          <label className="chronicle-trip-length-control">
            <span>Trip length</span>
            <select
              value={tripLengthDays ?? ''}
              onChange={(e) => handleTripLengthChange(e.target.value ? Number(e.target.value) : null)}
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
          <p className="chronicle-rate-line">No stops yet — describe your trip in the chat, or add one above.</p>
        ) : (
          dayGroups.map(([day, entries]) => (
            <ItineraryDayGroup key={day} day={day} entries={entries} showHeading={dayGroups.length > 1} onMove={moveStop} onRemove={removeStop} />
          ))
        )}
      </article>
    </div>
  )
}
