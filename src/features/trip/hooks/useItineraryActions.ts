import { useState } from 'react'
import { fetchLocation, type ThingToDo, type PlanDay } from '../../../lib/api/client'
import type { ItineraryItem } from '../../../lib/validation/schemas'
import { useTripStore } from '../../../store/tripStore'
import { queueTripWrite } from '../../../lib/api/tripWriteQueue'
import { organizeItinerary } from '../../../lib/itinerary/organizeItinerary'
import { reorderItinerary } from '../../../lib/itinerary/reorderItinerary'
import { adjustItineraryForTripLength } from '../../../lib/itinerary/adjustItineraryForTripLength'
import { planToItinerary } from '../../../lib/itinerary/planToItinerary'
import { logger } from '../../../lib/logger'

/**
 * Persists a trip patch through the serialized write queue so rapid edits
 * can't race and overwrite each other, and a failed save flips the store's
 * `saveError` flag (cleared optimistically here) so the UI can show it.
 */
function persist(tripId: string, patch: { itinerary?: ItineraryItem[]; tripLengthDays?: number | null }) {
  useTripStore.getState().setSaveError(false)
  queueTripWrite(tripId, patch, () => useTripStore.getState().setSaveError(true))
}

/**
 * Re-organizes the itinerary (day clustering + meal-slot ordering) and
 * persists the result, both to the shared store and the backend. Every
 * itinerary mutation (add, remove, change trip length, add-from-suggestion)
 * goes through this single path rather than several subtly different ones.
 */
function organizeAndPersist(items: ItineraryItem[], tripLengthDays: number | null, tripId: string) {
  const organized = organizeItinerary(items, tripLengthDays)
  useTripStore.getState().setItinerary(organized)
  persist(tripId, { itinerary: organized })
}

/**
 * All itinerary-mutating actions for a trip, backed by the shared store and
 * persisted to the backend. Centralizing these here (rather than in each
 * page component) means `ItineraryPage`, `OverviewPage`'s preview, and any
 * future page that needs to add/remove/reorder stops all share one
 * implementation instead of drifting apart.
 * @param tripId - The trip these actions mutate
 */
export function useItineraryActions(tripId: string) {
  const itinerary = useTripStore((s) => s.itinerary)
  const tripLengthDays = useTripStore((s) => s.tripLengthDays)
  const [adding, setAdding] = useState(false)

  /**
   * Adds a manually-entered stop. `locationText`, if given, is geocoded to
   * real coordinates so the stop can participate in day clustering and the
   * map route — geocoding failure fails soft (the stop is still added,
   * just without map placement) rather than blocking the user over a bad
   * location string.
   */
  async function addStop(input: { time: string; text: string; locationText?: string }) {
    setAdding(true)
    let lat: number | undefined
    let lng: number | undefined
    if (input.locationText?.trim()) {
      try {
        const geocoded = await fetchLocation(input.locationText)
        lat = geocoded.lat
        lng = geocoded.lng
      } catch (err) {
        logger.error('failed to geocode itinerary stop location', err)
      }
    }
    organizeAndPersist([...itinerary, { time: input.time, text: input.text, type: 'option', lat, lng }], tripLengthDays, tripId)
    setAdding(false)
  }

  /** Adds a things-to-do suggestion, carrying its real coordinates/category through. */
  function addFromThingToDo(item: ThingToDo) {
    organizeAndPersist(
      [...itinerary, { time: '', text: item.name, type: 'option', q: item.name, lat: item.lat, lng: item.lng, category: item.category }],
      tripLengthDays,
      tripId,
    )
  }

  function removeStop(index: number) {
    organizeAndPersist(
      itinerary.filter((_, i) => i !== index),
      tripLengthDays,
      tripId,
    )
  }

  /**
   * Moves a stop within its day group (the up/down move buttons). This
   * bypasses organizeAndPersist and writes through the store directly — a
   * manual move is a deliberate override of the smart ordering, and
   * re-running organizeItinerary here would immediately undo it.
   * @param entries - The day group's items (each with its absolute index into the full itinerary array)
   * @param entryPos - Position of the item being moved, within `entries`
   * @param direction - -1 to move earlier, 1 to move later
   */
  function moveStop(entries: { item: ItineraryItem; index: number }[], entryPos: number, direction: -1 | 1) {
    const targetPos = entryPos + direction
    if (targetPos < 0 || targetPos >= entries.length) return
    const reordered = reorderItinerary(itinerary, entries[entryPos].index, entries[targetPos].index, entries[entryPos].item.day ?? 1)
    useTripStore.getState().setItinerary(reordered)
    persist(tripId, { itinerary: reordered })
  }

  /**
   * Changing the trip length re-clusters everything from scratch (day
   * assignments are stripped first) rather than only fitting new stops
   * around whatever the previous day count happened to place — a day count
   * change is a deliberate re-plan, not an incremental addition. It also
   * adjusts the stop COUNT to a reasonable pace for the new length: more
   * days pulls in real nearby suggestions to fill them out, fewer days
   * trims down rather than cramming everything into a shorter trip.
   * @param newLength - The newly-selected trip length, or null to clear it
   * @param availableThingsToDo - Real nearby suggestions to draw additions from when growing the trip
   */
  function setTripLength(newLength: number | null, availableThingsToDo: ThingToDo[] = []) {
    const stripped = itinerary.map((item) => ({ ...item, day: undefined }))
    const adjusted = adjustItineraryForTripLength(stripped, newLength, availableThingsToDo)
    const organized = organizeItinerary(adjusted, newLength)
    useTripStore.getState().setItinerary(organized)
    useTripStore.getState().setTripLengthDays(newLength)
    persist(tripId, { itinerary: organized, tripLengthDays: newLength })
  }

  /**
   * Replaces the itinerary with a grounded AI plan. Each `placeIndexes` entry
   * maps back into the real `places` list, so only actual nearby places land
   * in the itinerary (their coordinates/category are carried through for the
   * map and clustering). The AI already assigned days and ordering, so this
   * does NOT re-run organizeItinerary — that would undo the model's sequencing.
   * @param plan - Day-grouped indices from the planner
   * @param places - The real candidate places the indices refer to
   * @param days - Trip length the plan was built for
   */
  function applyPlan(plan: PlanDay[], places: ThingToDo[], days: number) {
    const items = planToItinerary(plan, places)
    useTripStore.getState().setItinerary(items)
    useTripStore.getState().setTripLengthDays(days)
    persist(tripId, { itinerary: items, tripLengthDays: days })
  }

  return { itinerary, tripLengthDays, adding, addStop, addFromThingToDo, removeStop, moveStop, setTripLength, applyPlan }
}
