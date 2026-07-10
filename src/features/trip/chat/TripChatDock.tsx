import { useNavigate } from 'react-router-dom'
import type { LocationResult, Trip } from '../../../lib/api/client'
import { useTripStore } from '../../../store/tripStore'
import { useItineraryActions } from '../hooks/useItineraryActions'
import { useTripChat } from './useTripChat'
import { TripChatPanel } from './TripChatPanel'
import { createTripForDestination } from '../planning/createTripForDestination'
import { stashOpeningChat } from './chatHandoff'

/**
 * The trip assistant as a persistent side dock, available on every trip page
 * (Home, Itinerary, Map, Things to do, Weather). Chat state lives here in the
 * shell, so the conversation continues as you move between pages and survives
 * reloads. A plan edit re-plans the itinerary (updating the shared store, so
 * whatever page you're on reflects it), a question is answered, and naming a
 * new destination rebuilds the trip there.
 *
 * @param open - Whether the dock is expanded (the shell owns this so it can
 * offset page content when the dock is open on desktop)
 */
export function TripChatDock({
  trip,
  location,
  open,
  onOpenChange,
}: {
  trip: Trip
  location: LocationResult | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const navigate = useNavigate()
  const itinerary = useTripStore((s) => s.itinerary)
  const tripLengthDays = useTripStore((s) => s.tripLengthDays)
  const { applyPlan } = useItineraryActions(trip.id)
  const places = location?.thingsToDo ?? []

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
    navigate(`/trip/${built.tripId}`)
  }

  const chat = useTripChat(trip.id, places, tripLengthDays ?? 3, location?.displayName, applyPlan, handleRelocate)

  return (
    <>
      {!open && (
        <button type="button" className="chronicle-chat-fab" onClick={() => onOpenChange(true)}>
          <span aria-hidden="true">✨</span> Plan by chat
        </button>
      )}
      <aside className={`chronicle-chat-dock${open ? ' chronicle-chat-dock--open' : ''}`} aria-hidden={!open}>
        <TripChatPanel
          messages={chat.messages}
          isThinking={chat.isThinking}
          error={chat.error}
          disabled={places.length === 0}
          onSend={(text) => void chat.send(text, itinerary)}
          locationName={location?.displayName}
          onClose={() => onOpenChange(false)}
        />
      </aside>
    </>
  )
}
