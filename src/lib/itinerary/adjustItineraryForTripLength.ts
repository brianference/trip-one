import type { ItineraryItem } from '../validation/schemas'
import type { ThingToDo } from '../api/client'
import { dedupeItinerary, dedupePlaceSuggestions, normalizeStopName } from './dedupeItinerary'

/** A reasonable trip-planning pace: a couple of meals plus a couple of activities per day. */
const TARGET_ITEMS_PER_DAY = 4

/**
 * Adds or removes itinerary items to roughly match a reasonable pace for the
 * new trip length, rather than leaving the same fixed set of stops to be
 * crammed into fewer days or thinly spread across more.
 *
 * Adding: pulls real, highest-rated nearby suggestions not already in the
 * itinerary (never fabricates a stop) until reaching the target count, or
 * until real suggestions run out — it's fine to fall short if there simply
 * aren't enough real places nearby.
 *
 * Candidate lists are deduped **before** selection so two identically-named
 * suggestions (source-merge drift) cannot both be added. That gap once let
 * the Tokyo demo grow "Odaiba Beach" / "Odaiba Marine Park" / "Isshiki Beach"
 * pairs into the stored row.
 *
 * Removing: trims from the end, keeping the earliest stops (organizeItinerary
 * already orders the array by day/meal-slot, so trimming the tail drops the
 * least-prioritized items rather than an arbitrary subset).
 * @param items - The current itinerary, in its existing order
 * @param newLength - The newly-selected trip length, or null if cleared
 * @param availableThingsToDo - Real nearby suggestions to draw additions from
 * @returns The adjusted itinerary, unclustered (day fields untouched — the caller re-clusters)
 */
export function adjustItineraryForTripLength(
  items: ItineraryItem[],
  newLength: number | null,
  availableThingsToDo: ThingToDo[],
): ItineraryItem[] {
  if (!newLength || newLength <= 0) return items

  // Drop any existing dups first so target math and "already present" checks
  // don't treat two copies of the same place as two distinct stops.
  const uniqueItems = dedupeItinerary(items)
  const targetCount = newLength * TARGET_ITEMS_PER_DAY

  if (uniqueItems.length > targetCount) {
    return uniqueItems.slice(0, targetCount)
  }

  if (uniqueItems.length < targetCount) {
    const existingNames = new Set(uniqueItems.map((item) => normalizeStopName(item.text)))
    // Dedupe within the candidate list itself — filtering only against
    // existing names left two "Odaiba Beach" rows free to both be selected.
    const candidates = dedupePlaceSuggestions(availableThingsToDo)
      .filter((thing) => !existingNames.has(normalizeStopName(thing.name)))
      .sort((a, b) => (b.rating ?? -Infinity) - (a.rating ?? -Infinity))
    const needed = targetCount - uniqueItems.length
    const additions: ItineraryItem[] = candidates.slice(0, needed).map((thing) => ({
      time: '',
      text: thing.name,
      type: 'option',
      q: thing.name,
      lat: thing.lat,
      lng: thing.lng,
      category: thing.category,
    }))
    return dedupeItinerary([...uniqueItems, ...additions])
  }

  return uniqueItems
}
