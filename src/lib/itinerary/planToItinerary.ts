import type { ItineraryItem } from '../validation/schemas'
import type { ThingToDo, PlanDay } from '../api/client'
import { dedupeItinerary } from './dedupeItinerary'

/**
 * Maps a grounded AI plan (day-grouped indices into `places`) into itinerary
 * items, carrying each real place's coordinates and category through and
 * keeping the AI's day assignment and order. Indices outside `places` are
 * skipped, so a bad index can never produce a fabricated stop.
 *
 * Dedupes the result so a plan that references the same place on two days
 * (or twice on one day) cannot invent the Tokyo-demo style duplicates.
 *
 * @param plan - Day-grouped indices from the planner
 * @param places - The real candidate places the indices refer to
 * @returns Itinerary items in the AI's order, each tagged with its day
 */
export function planToItinerary(plan: PlanDay[], places: ThingToDo[]): ItineraryItem[] {
  const items: ItineraryItem[] = []
  for (const dayPlan of plan) {
    for (const idx of dayPlan.placeIndexes) {
      const place = places[idx]
      if (!place) continue
      const item: ItineraryItem = {
        time: '',
        text: place.name,
        type: 'option',
        q: place.name,
        lat: place.lat,
        lng: place.lng,
        category: place.category,
        day: dayPlan.day,
      }
      // Carry real experience fields through so the itinerary can render a
      // booking card. Never invent price/duration/currency client-side.
      if (place.source) item.source = place.source
      if (place.productCode) item.productCode = place.productCode
      if (place.priceFrom != null) item.priceFrom = place.priceFrom
      if (place.currency) item.currency = place.currency
      if (place.durationMinutes != null) item.durationMinutes = place.durationMinutes
      if (place.bookingUrl) item.bookingUrl = place.bookingUrl
      if (place.freeCancellation === true) item.freeCancellation = true
      items.push(item)
    }
  }
  // First occurrence keeps its AI-assigned day/time; later same-name indices drop.
  return dedupeItinerary(items)
}
