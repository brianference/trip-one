import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import type { LocationResult, Trip, PlanDay } from '../../../lib/api/client'
import type { ThingToDo } from '../../../lib/api/client'
import type { ItineraryItem } from '../../../lib/validation/schemas'
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
  onAddPlaces,
}: {
  trip: Trip
  location: LocationResult | null
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Adds places the chat found on demand (nearby search) to the map + pool. */
  onAddPlaces?: (places: ThingToDo[]) => void
}) {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const itinerary = useTripStore((s) => s.itinerary)
  const tripLengthDays = useTripStore((s) => s.tripLengthDays)
  const { applyPlan, restorePlan, addStops } = useItineraryActions(trip.id)
  const places = location?.thingsToDo ?? []
  const [showToast, setShowToast] = useState(false)
  // The itinerary + length snapshotted just before the last chat-driven plan
  // change, so the toast can offer a one-tap Undo.
  const [undoSnapshot, setUndoSnapshot] = useState<{ itinerary: ItineraryItem[]; days: number | null } | null>(null)

  // Wrap applyPlan so a chat-driven itinerary change always flashes a toast —
  // otherwise, on a page other than the itinerary, the update is invisible.
  const applyWithToast = useCallback(
    (plan: PlanDay[], candidatePlaces: ThingToDo[], days: number) => {
      // Snapshot the pre-change plan from the store (not a possibly-stale
      // closure) so Undo restores exactly what was there.
      const store = useTripStore.getState()
      setUndoSnapshot({ itinerary: store.itinerary, days: store.tripLengthDays })
      applyPlan(plan, candidatePlaces, days)
      setShowToast(true)
      // Take the traveler to the consolidated plan page so they SEE the change.
      if (!pathname.endsWith('/plan')) navigate(`/trip/${trip.id}/plan`)
    },
    [applyPlan, pathname, navigate, trip.id],
  )

  // Same wrapper for a nearby-search add: snapshot for Undo, append the stops,
  // flash the toast, and jump to the Plan page so the additions are visible.
  const addStopsWithNav = useCallback(
    (newPlaces: { name: string; lat?: number; lng?: number; category?: string }[], dayCount: number) => {
      const store = useTripStore.getState()
      setUndoSnapshot({ itinerary: store.itinerary, days: store.tripLengthDays })
      const added = addStops(newPlaces, dayCount)
      setShowToast(true)
      if (!pathname.endsWith('/plan')) navigate(`/trip/${trip.id}/plan`)
      return added
    },
    [addStops, pathname, navigate, trip.id],
  )

  // Tapping an added-place chip in the chat: mark it as the focused place (the
  // Plan page opens its detail, selects its day, and pans the map) and jump to
  // the Plan page if we're not already there.
  const handlePlaceClick = useCallback(
    (place: { name: string; lat?: number; lng?: number; category?: string; day: number }) => {
      useTripStore.getState().focusOnPlace(place)
      if (!pathname.endsWith('/plan')) navigate(`/trip/${trip.id}/plan`)
    },
    [pathname, navigate, trip.id],
  )

  const handleUndo = useCallback(() => {
    if (undoSnapshot) restorePlan(undoSnapshot.itinerary, undoSnapshot.days)
    setUndoSnapshot(null)
    setShowToast(false)
  }, [undoSnapshot, restorePlan])

  useEffect(() => {
    if (!showToast) return
    // Longer window when an Undo is offered so it's actually reachable.
    const t = setTimeout(() => setShowToast(false), 6000)
    return () => clearTimeout(t)
  }, [showToast])

  // Flag the open dock on <body> so CSS can hide the top-right theme toggle on
  // mobile (where the full-width dock would otherwise collide with it).
  useEffect(() => {
    document.body.classList.toggle('trip-chat-open', open)
    return () => document.body.classList.remove('trip-chat-open')
  }, [open])

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

  const chat = useTripChat(
    trip.id,
    places,
    tripLengthDays ?? 3,
    location?.displayName,
    applyWithToast,
    handleRelocate,
    location?.lat,
    location?.lng,
    onAddPlaces,
    addStopsWithNav,
  )

  return (
    <>
      {showToast && (
        <div className="chronicle-update-toast" role="status">
          <span>✓ Itinerary updated</span>
          {undoSnapshot && (
            <button type="button" className="chronicle-update-toast-undo" onClick={handleUndo}>
              Undo
            </button>
          )}
        </div>
      )}
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
          pendingRelocate={chat.pendingRelocate}
          onConfirmRelocate={() => void chat.confirmRelocate()}
          onCancelRelocate={chat.cancelRelocate}
          onPlaceClick={handlePlaceClick}
          onNewTrip={() => navigate('/')}
        />
      </aside>
    </>
  )
}
