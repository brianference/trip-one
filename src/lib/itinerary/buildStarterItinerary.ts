import type { ThingToDo } from '../api/client'
import type { ItineraryItem } from '../validation/schemas'

const STARTER_ITEM_COUNT = 15

/**
 * Build a starter itinerary from the top-rated things-to-do for a location, so a
 * newly created trip isn't empty. Each item is unscheduled (`time: ''`) since these
 * are suggestions the user can drag, reorder, or assign real times to later.
 * Entries with no rating sort last rather than crashing or being dropped.
 * @param thingsToDo - Things-to-do returned by `/api/location` (Tripadvisor + Google Places)
 * @returns Up to 15 `option`-type itinerary items, highest-rated first
 */
export function buildStarterItinerary(thingsToDo: ThingToDo[]): ItineraryItem[] {
  return [...thingsToDo]
    .sort((a, b) => (b.rating ?? -Infinity) - (a.rating ?? -Infinity))
    .slice(0, STARTER_ITEM_COUNT)
    .map((item) => ({ time: '', text: item.name, type: 'option', q: item.name }))
}
