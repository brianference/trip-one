import type { ItineraryItem } from '../validation/schemas'
import type { ThingToDo, PlanDay } from '../api/client'

/**
 * Maps a grounded AI plan (day-grouped indices into `places`) into itinerary
 * items, carrying each real place's coordinates and category through and
 * keeping the AI's day assignment and order. Indices outside `places` are
 * skipped, so a bad index can never produce a fabricated stop.
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
      items.push({
        time: '',
        text: place.name,
        type: 'option',
        q: place.name,
        lat: place.lat,
        lng: place.lng,
        category: place.category,
        day: dayPlan.day,
      })
    }
  }
  return items
}
