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
function persist(tripId: string, patch: { itinerary?: ItineraryItem[]; tripLengthDays?: number | null; startDate?: string | null }) {
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

  /**
   * Adds a place to a SPECIFIC day (from the detail sheet's "Add to Day N").
   * Unlike addFromThingToDo, this respects the chosen day instead of
   * re-clustering, so the traveler's explicit placement is honored.
   */
  function addToDay(input: { name: string; lat?: number; lng?: number; category?: string }, day: number) {
    const next: ItineraryItem[] = [
      ...itinerary,
      { time: '', text: input.name, type: 'option', q: input.name, lat: input.lat, lng: input.lng, category: input.category, day },
    ]
    useTripStore.getState().setItinerary(next)
    persist(tripId, { itinerary: next })
  }

  /**
   * Appends several found places to the itinerary, spread one-per-day across the
   * trip (round-robin), without re-clustering. Used by the chat's nearby search
   * ("add a beach", "add sushi") so the results reliably land on real days and
   * the chat can report exactly what went where. Returns each addition's day.
   */
  function addStops(newPlaces: { name: string; lat?: number; lng?: number; category?: string }[], dayCount: number): { name: string; day: number }[] {
    const days = Math.max(dayCount, 1)
    const additions: ItineraryItem[] = newPlaces.map((p, i) => ({
      time: '',
      text: p.name,
      type: 'option',
      q: p.name,
      lat: p.lat,
      lng: p.lng,
      category: p.category,
      day: (i % days) + 1,
    }))
    const next = [...itinerary, ...additions]
    useTripStore.getState().setItinerary(next)
    persist(tripId, { itinerary: next })
    return additions.map((a) => ({ name: a.text, day: a.day ?? 1 }))
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
   * Moves a single stop to a different day (the row's day picker). Like
   * addToDay, this is a deliberate placement, so it writes the new day
   * directly instead of re-clustering — re-running organizeItinerary would
   * override the traveler's explicit choice.
   */
  function moveToDay(index: number, day: number) {
    const next = itinerary.map((it, i) => (i === index ? { ...it, day } : it))
    useTripStore.getState().setItinerary(next)
    persist(tripId, { itinerary: next })
  }

  /**
   * Sets (or clears) a stop's clock time from the row's `<input type="time">`.
   * An empty string falls the row back to its soft time-of-day slot label.
   */
  function setStopTime(index: number, time: string) {
    const next = itinerary.map((it, i) => (i === index ? { ...it, time } : it))
    useTripStore.getState().setItinerary(next)
    persist(tripId, { itinerary: next })
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
  function applyPlan(plan: PlanDay[], places: ThingToDo[], days: number, opts: { merge?: boolean } = {}) {
    const planned = planToItinerary(plan, places)
    const items = opts.merge ? mergePreservingUnmentionedDays(itinerary, planned, plan) : planned
    useTripStore.getState().setItinerary(items)
    useTripStore.getState().setTripLengthDays(days)
    persist(tripId, { itinerary: items, tripLengthDays: days })
  }

  /** Sets (or clears) the trip's start date, persisting it and updating the store. */
  function setStartDate(date: string | null) {
    useTripStore.getState().setStartDate(date)
    persist(tripId, { startDate: date })
  }

  /**
   * Restores a previously-snapshotted itinerary and trip length — the "Undo"
   * behind a chat-driven plan change. Writes the exact prior state back with no
   * re-clustering so undo is a faithful reversal, not a re-plan.
   */
  function restorePlan(items: ItineraryItem[], days: number | null) {
    useTripStore.getState().setItinerary(items)
    useTripStore.getState().setTripLengthDays(days)
    persist(tripId, { itinerary: items, tripLengthDays: days })
  }

  return { itinerary, tripLengthDays, adding, addStop, addFromThingToDo, addToDay, addStops, removeStop, moveStop, moveToDay, setStopTime, setTripLength, setStartDate, applyPlan, restorePlan }
}

/**
 * Merges a chat-driven plan revision into the existing itinerary, keeping days
 * the model did not mention.
 *
 * A conversational edit is scoped: "add a food stop on day 2" should change day
 * 2 and nothing else. The model, though, answers with whatever days it
 * considered — often just the one — and applying that wholesale replaced the
 * itinerary and silently deleted every other day's stops. That is data loss on
 * a saved trip, from a request that asked to ADD something.
 *
 * The rule that makes this safe is the distinction between absent and empty:
 *
 *   - A day PRESENT in the revision (even with no stops) is intentional. That
 *     is how "clear day 3" and "remove the last stop on day 4" work, so those
 *     must still be honoured.
 *   - A day ABSENT from the revision was simply not discussed, so its existing
 *     stops are carried over untouched.
 *
 * @param existing - The itinerary before the edit
 * @param planned - The revision, already mapped to itinerary items
 * @param plan - The raw day groups, needed to see which days were mentioned
 */
export function mergePreservingUnmentionedDays(
  existing: ItineraryItem[],
  planned: ItineraryItem[],
  plan: PlanDay[],
): ItineraryItem[] {
  const mentioned = new Set(plan.map((d) => d.day))
  const carriedOver = existing.filter((item) => !mentioned.has(item.day ?? 1))
  return [...carriedOver, ...planned].sort((a, b) => (a.day ?? 1) - (b.day ?? 1))
}
