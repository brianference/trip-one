import type { ThingToDo } from './mergeThingsToDo'
import { logger } from '../../src/lib/logger'

// 50000m is the documented maximum radius Google Places Nearby Search accepts.
// A smaller radius works fine for a city but returns almost nothing for a
// large national park, whose real points of interest can be tens of km from
// the park's single geocoded center coordinate.
const SEARCH_RADIUS_M = 50000

// Nearby Search takes a single `type` per call. We query attractions,
// restaurants, AND cafes so the itinerary has real meals and real coffee to
// draw from — dedicated coffee shops carry Google's `cafe` type and rarely
// surface in a `restaurant` search, so "add a coffee shop" had nothing real to
// ground to before this. Each new location is cached in Supabase, so the extra
// calls are paid once per location, not per visit.
const SEARCH_TYPES = ['tourist_attraction', 'restaurant', 'cafe'] as const

// Search types that return food/drink venues (so category promotion and the
// lodging filter apply to them).
const FOOD_SEARCH_TYPES: readonly string[] = ['restaurant', 'cafe']

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
  /** Text Search returns a full address here rather than `vicinity`. */
  formatted_address?: string
  geometry?: { location?: { lat?: number; lng?: number } }
}

// How many text-search results to keep (enough to fill a multi-day plan).
const TEXT_SEARCH_LIMIT = 20

/**
 * Category for a result, given which search it came from. For the restaurant
 * search we promote any food type to the front (a real eatery often lists
 * `bar`/`point_of_interest` before `restaurant`), defaulting to `restaurant`
 * since that's what we asked for. For the attraction search we keep `types[0]`
 * as-is — otherwise a hotel or museum that merely HAS a restaurant would get
 * mislabeled as food.
 */
function pickCategory(types: string[], searchType: string): string {
  if (FOOD_SEARCH_TYPES.includes(searchType)) {
    // Promote a real food/drink type to the front (a cafe often lists
    // `store`/`point_of_interest` first), defaulting to what we searched for.
    return FOOD_TYPES.find((t) => types.includes(t)) ?? searchType
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
      // A hotel with a notable restaurant/cafe can surface in a food search.
      // It's not somewhere a traveler plans a meal or coffee, so drop
      // lodging-typed results from those searches.
      if (FOOD_SEARCH_TYPES.includes(type) && (item.types ?? []).includes('lodging')) return false
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

/** Category for a free-text result: promote a real food/drink type, else the first type. */
function categorizeTextResult(types: string[]): string {
  return FOOD_TYPES.find((t) => types.includes(t)) ?? types.find((t) => t !== 'point_of_interest' && t !== 'establishment') ?? types[0] ?? 'attraction'
}

/**
 * Free-text Google Places search near a coordinate — "sushi restaurant",
 * "rooftop bar", "vegan cafe", etc. — so the chat can add ANY kind of place the
 * fixed nearby pool doesn't already cover. Returns real, correctly-typed
 * results (never fabricated); fails soft to an empty list.
 * @param query - The traveler's requested kind of place
 * @param lat - Latitude to bias the search toward
 * @param lng - Longitude to bias the search toward
 * @param apiKey - Google Places API key
 */
export async function textSearchPlaces(query: string, lat: number, lng: number, apiKey: string): Promise<ThingToDo[]> {
  const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query)}&location=${lat},${lng}&radius=${SEARCH_RADIUS_M}&key=${apiKey}`
  try {
    const res = await fetch(url)
    if (!res.ok) {
      logger.warn('places text search non-ok response', { status: res.status })
      return []
    }
    const body = (await res.json()) as { results?: PlacesResult[] }
    return (body.results ?? [])
      .filter((item) => !(item.types ?? []).includes('lodging'))
      .slice(0, TEXT_SEARCH_LIMIT)
      .map((item) => ({
        name: item.name,
        category: categorizeTextResult(item.types ?? []),
        source: 'places' as const,
        rating: item.rating,
        address: item.vicinity ?? item.formatted_address,
        lat: item.geometry?.location?.lat,
        lng: item.geometry?.location?.lng,
        placeId: item.place_id,
      }))
  } catch (err) {
    logger.error('places text search failed', err)
    return []
  }
}
