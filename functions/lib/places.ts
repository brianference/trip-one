import type { ThingToDo } from './mergeThingsToDo'
import { logger } from '../../src/lib/logger'

// 50000m is the documented maximum radius Google Places Nearby Search accepts.
// A smaller radius works fine for a city but returns almost nothing for a
// large national park, whose real points of interest can be tens of km from
// the park's single geocoded center coordinate.
const SEARCH_RADIUS_M = 50000

// Nearby Search takes a single `type` per call. We query attractions AND
// restaurants so the itinerary can actually schedule real meals — before
// this the pool was attractions-only, so breakfast/lunch/dinner slots had no
// real restaurants to fill them. Each new location is cached in Supabase, so
// the extra call is paid once per location, not per visit.
const SEARCH_TYPES = ['tourist_attraction', 'restaurant'] as const

// Food-serving place types, in priority order. A restaurant's Places `types`
// array often leads with something unhelpful (e.g. `bar`, `casino`, `lodging`)
// even when `restaurant` is present, so picking `types[0]` blindly mislabels
// real eateries and the itinerary's meal-slot detector then misses them. We
// promote any food type to the front so meals get scheduled.
const FOOD_TYPES = ['restaurant', 'cafe', 'bakery', 'meal_takeaway', 'meal_delivery', 'food'] as const

interface PlacesResult {
  place_id?: string
  name: string
  types: string[]
  rating?: number
  vicinity?: string
  geometry?: { location?: { lat?: number; lng?: number } }
}

/**
 * Category for a result, given which search it came from. For the restaurant
 * search we promote any food type to the front (a real eatery often lists
 * `bar`/`point_of_interest` before `restaurant`), defaulting to `restaurant`
 * since that's what we asked for. For the attraction search we keep `types[0]`
 * as-is — otherwise a hotel or museum that merely HAS a restaurant would get
 * mislabeled as food.
 */
function pickCategory(types: string[], searchType: string): string {
  if (searchType === 'restaurant') {
    return FOOD_TYPES.find((t) => types.includes(t)) ?? 'restaurant'
  }
  return types[0] ?? 'attraction'
}

async function searchPlacesByType(lat: number, lng: number, type: string, apiKey: string): Promise<ThingToDo[]> {
  const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=${SEARCH_RADIUS_M}&type=${type}&key=${apiKey}`
  const res = await fetch(url)
  if (!res.ok) {
    logger.warn('places search non-ok response', { status: res.status, type })
    return []
  }
  const body = (await res.json()) as { results?: PlacesResult[] }
  return (body.results ?? [])
    .filter((item) => {
      // A hotel with a notable restaurant can surface in a type=restaurant
      // search. It's not somewhere a traveler plans a meal, so drop
      // lodging-typed results from the restaurant search.
      if (type === 'restaurant' && (item.types ?? []).includes('lodging')) return false
      return true
    })
    .map((item) => ({
      name: item.name,
      category: pickCategory(item.types ?? [], type),
      source: 'places' as const,
      rating: item.rating,
      address: item.vicinity,
      lat: item.geometry?.location?.lat,
      lng: item.geometry?.location?.lng,
      placeId: item.place_id,
    }))
}

/**
 * Search Google Places near a coordinate for both attractions and
 * restaurants, deduped by name. Fails soft: any failure for a given type
 * yields no results for it rather than propagating, since Tripadvisor results
 * (and the other type) can stand in on their own.
 * @param lat - Latitude to search near
 * @param lng - Longitude to search near
 * @param apiKey - Google Places API key
 * @returns A combined, deduped list of things to do (may be empty)
 */
export async function searchPlaces(lat: number, lng: number, apiKey: string): Promise<ThingToDo[]> {
  try {
    const perType = await Promise.all(SEARCH_TYPES.map((type) => searchPlacesByType(lat, lng, type, apiKey)))
    const seen = new Set<string>()
    const merged: ThingToDo[] = []
    for (const item of perType.flat()) {
      const key = item.name.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      merged.push(item)
    }
    return merged
  } catch (err) {
    logger.error('places search failed', err)
    return []
  }
}
