import type { ThingToDo } from './mergeThingsToDo'
import { isAdultVenue } from '../../src/lib/places/audience'
import { isFoodCategory } from '../../src/lib/places/foodCategories'
import { logger } from '../../src/lib/logger'

// 50000m is the documented maximum radius for legacy Places location bias.
// A smaller radius works fine for a city but returns almost nothing for a
// large national park, whose real points of interest can be tens of km from
// the park's single geocoded center coordinate.
const SEARCH_RADIUS_M = 50000

// One call per type. We query attractions, restaurants, AND cafes so the
// itinerary has real meals and real coffee to draw from — dedicated coffee
// shops carry Google's `cafe` type and rarely surface in a `restaurant`
// search, so "add a coffee shop" had nothing real to ground to before this.
// Each new location is cached in D1, so the extra calls are paid once per
// location, not per visit.
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

/**
 * Body-level statuses Google treats as success for Nearby/Text Search.
 * HTTP 200 alone is NOT success: REQUEST_DENIED, OVER_QUERY_LIMIT, and
 * INVALID_REQUEST also return 200 with an empty `results` array.
 */
const PLACES_SUCCESS_STATUSES = new Set(['OK', 'ZERO_RESULTS'])

interface PlacesResult {
  place_id?: string
  name: string
  types: string[]
  rating?: number
  /** How many ratings the place has — the popularity signal, distinct from the average. */
  user_ratings_total?: number
  vicinity?: string
  /** Text Search returns a full address here rather than `vicinity`. */
  formatted_address?: string
  geometry?: { location?: { lat?: number; lng?: number } }
}

interface PlacesApiBody {
  status?: string
  error_message?: string
  results?: PlacesResult[]
}

/**
 * Outcome of a Google Places search.
 *
 * WHY a result type (not bare `[]` on every miss): Google Places returns HTTP
 * 200 with a body-level `status` for REQUEST_DENIED (bad/revoked/restricted
 * key), OVER_QUERY_LIMIT, and INVALID_REQUEST — each with empty `results`.
 * Returning `[]` for those made location self-heal cache a failure as a
 * genuine empty destination (silent total data loss; same permanent-poison
 * hazard as experiences.ts / interest-places). Callers that fail soft still
 * map `ok: false` → empty list for the traveler; callers that write cache
 * must only persist on `ok: true`.
 *
 * ZERO_RESULTS is `ok: true` with `places: []` — a real, empty answer.
 */
export type PlacesSearchOutcome = { ok: true; places: ThingToDo[] } | { ok: false }

/**
 * Outcome of grounding a single named venue via Text Search.
 * `ok: true, place: null` is a genuine no-match; `ok: false` is an API failure.
 */
export type FindPlaceOutcome = { ok: true; place: ThingToDo | null } | { ok: false }

// How many text-search results to keep (enough to fill a multi-day plan).
const TEXT_SEARCH_LIMIT = 20

// Google's text-search `location`+`radius` is only a BIAS, not a hard filter:
// a query with few local matches ("aquarium" near a small island) happily
// returns globally-famous ones (a Florida or Cleveland aquarium for a Corfu
// trip). We hard-drop anything farther than this from the trip center so an
// "added nearby" place is actually nearby. 80km is generous enough for a
// national park's spread-out points of interest while still excluding results
// on another continent.
const TEXT_SEARCH_MAX_KM = 80

/**
 * Tighter ceiling for food and drink. An attraction can justify a drive — a
 * national-park lodge 47km out is a legitimate day's destination — but a cafe
 * is somewhere you stop when you're already there. Without a separate limit,
 * Jackson trips picked up espresso bars 32-39km away across the Idaho border
 * purely because the town's own venues had run out.
 */
const FOOD_MAX_KM = 15

/** Great-circle distance between two lat/lng points, in kilometres. */
export function distanceKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371
  const dLat = ((bLat - aLat) * Math.PI) / 180
  const dLng = ((bLng - aLng) * Math.PI) / 180
  const lat1 = (aLat * Math.PI) / 180
  const lat2 = (bLat * Math.PI) / 180
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

/**
 * Category for a result, given which search it came from. For the restaurant
 * search we promote any food type to the front (a real eatery often lists
 * `bar`/`point_of_interest` before `restaurant`), defaulting to `restaurant`
 * since that's what we asked for. For attraction searches we prefer the type
 * we asked for when it appears in `types`. Free-text search helpers may still
 * lead with `establishment`/`point_of_interest` — never label those as
 * "establishment"; fall back to the intended search type instead.
 */
function pickCategory(types: string[], searchType: string): string {
  if (FOOD_SEARCH_TYPES.includes(searchType)) {
    // Promote a real food/drink type to the front (a cafe often lists
    // `store`/`point_of_interest` first), defaulting to what we searched for.
    return FOOD_TYPES.find((t) => types.includes(t)) ?? searchType
  }
  if (types.includes(searchType)) return searchType
  // Prefer a concrete non-generic type (museum, park, …); if Google only
  // sent establishment/point_of_interest, keep the category we searched for
  // (Nearby type= is authoritative for the pool role).
  return (
    types.find((t) => t !== 'point_of_interest' && t !== 'establishment') ??
    searchType
  )
}

/**
 * Reads Google Places body status. Never logs the API key.
 * @param body - Parsed JSON body from Nearby or Text Search
 * @param context - Short label for logs (type / query name), never secrets
 */
function parsePlacesApiBody(
  body: PlacesApiBody,
  context: string,
): { ok: true; results: PlacesResult[] } | { ok: false } {
  const status = body.status
  if (status != null && PLACES_SUCCESS_STATUSES.has(status)) {
    return { ok: true, results: body.results ?? [] }
  }
  // Missing status is failure too — real Google responses always send it.
  // Do not treat it as empty success: that is exactly how a bad key became
  // a permanently empty destination in the location cache.
  logger.warn('places API body-level failure', {
    context,
    status: status ?? 'missing',
    error_message: body.error_message,
  })
  return { ok: false }
}

/**
 * Maps a per-type Nearby Search hit into the shared ThingToDo shape, applying
 * food lodging/distance filters for restaurant/cafe searches.
 */
function mapTypedSearchResult(item: PlacesResult, type: string, lat: number, lng: number): ThingToDo | null {
  // A hotel with a notable restaurant/cafe can surface in a food search.
  // It's not somewhere a traveler plans a meal or coffee, so drop
  // lodging-typed results from those searches.
  if (FOOD_SEARCH_TYPES.includes(type) && (item.types ?? []).includes('lodging')) return null
  // The search spans SEARCH_RADIUS_M (50km) so a national park's spread-out
  // attractions are reachable, but that radius applied to food put a Tim
  // Hortons 47km from Whistler on the plan. Attractions justify the drive;
  // a coffee stop does not.
  // Only drop on a KNOWN excessive distance. A result without coordinates
  // can't be measured, and dropping it would silently delete places whose
  // source simply omits geometry.
  if (FOOD_SEARCH_TYPES.includes(type)) {
    const plat = item.geometry?.location?.lat
    const plng = item.geometry?.location?.lng
    if (plat != null && plng != null && distanceKm(lat, lng, plat, plng) > FOOD_MAX_KM) return null
  }
  return {
    name: item.name,
    category: pickCategory(item.types ?? [], type),
    // Preserve the adult signal BEFORE food promotion buries it: a saloon's
    // types are ['bar', 'restaurant', ...] and pickCategory returns
    // 'restaurant', which made it invisible to the audience filter.
    adultVenue: isAdultVenue({ name: item.name, category: '', types: item.types ?? [] }),
    source: 'places' as const,
    rating: item.rating,
    numReviews: item.user_ratings_total,
    address: item.vicinity ?? item.formatted_address,
    lat: item.geometry?.location?.lat,
    lng: item.geometry?.location?.lng,
    placeId: item.place_id,
  }
}

/** Raw list fetch: success carries Google `results`; failure already logged. */
type PlacesListFetch = { ok: true; results: PlacesResult[] } | { ok: false }

/**
 * Shared HTTP + body parse for one Places list endpoint.
 * Logs every non-OK body status with status + error_message (never the key).
 *
 * @param url - Fully built request URL (key included; never logged)
 * @param context - Log label, e.g. `nearby:restaurant` or `text:cafe`
 */
async function fetchPlacesList(url: string, context: string): Promise<PlacesListFetch> {
  const res = await fetch(url)
  if (!res.ok) {
    logger.warn('places search non-ok response', { status: res.status, context })
    return { ok: false }
  }
  const body = (await res.json()) as PlacesApiBody
  const parsed = parsePlacesApiBody(body, context)
  if (!parsed.ok) return { ok: false }
  return { ok: true, results: parsed.results }
}

/**
 * One category search for the location pool via legacy Nearby Search.
 *
 * WHY no Nearby→Text Search fallback: an earlier path fell back to Text
 * Search when Nearby failed, based on a misread of production data
 * (`things_to_do` vs `thingsToDo` made Nearby look empty while Text Search
 * looked fine). A deployed diagnostic later showed Nearby works from Workers
 * (HTTP 200, status OK, 20 results for tourist_attraction and restaurant).
 * The fallback also introduced a real bug: Text Search with `type=` returned
 * ZERO_RESULTS that was silently cacheable as an empty city. Body-level
 * status checking (OK/ZERO_RESULTS success; everything else logged failure)
 * and "never cache a failed lookup" remain — those are independent of the
 * removed fallback.
 *
 * @param lat - Search centre latitude
 * @param lng - Search centre longitude
 * @param type - Google place type (`tourist_attraction` | `restaurant` | `cafe`)
 * @param apiKey - Google Places API key (never logged)
 */
async function searchPlacesByType(
  lat: number,
  lng: number,
  type: string,
  apiKey: string,
): Promise<PlacesSearchOutcome> {
  const nearbyUrl = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=${SEARCH_RADIUS_M}&type=${type}&key=${apiKey}`
  const nearby = await fetchPlacesList(nearbyUrl, `nearby:${type}`)
  if (!nearby.ok) return { ok: false }

  const places = nearby.results
    .map((item) => mapTypedSearchResult(item, type, lat, lng))
    .filter((item): item is ThingToDo => item != null)
  return { ok: true, places }
}

/**
 * Search Google Places near a coordinate for attractions, restaurants, and
 * cafes, deduped by name. Nearby Search only (no Text Search fallback).
 *
 * Fails soft at the HTTP layer only in the sense that a total outage yields
 * `{ ok: false }` rather than throwing — callers map that to an empty list
 * for the traveler. Body-level Google failures (REQUEST_DENIED, etc.) are
 * also `{ ok: false }`, never a silent empty success. Partial type success
 * (one type OK, another denied) still returns `{ ok: true }` with what was
 * found so Tripadvisor can fill gaps without poisoning the cache as empty.
 *
 * @param lat - Latitude to search near
 * @param lng - Longitude to search near
 * @param apiKey - Google Places API key
 * @returns Discriminated outcome — only `ok: true` may be cached as empty
 */
export async function searchPlaces(lat: number, lng: number, apiKey: string): Promise<PlacesSearchOutcome> {
  try {
    const perType = await Promise.all(SEARCH_TYPES.map((type) => searchPlacesByType(lat, lng, type, apiKey)))
    // Every type failed → overall failure (distinguishable from ZERO_RESULTS).
    if (perType.every((r) => !r.ok)) return { ok: false }

    const seen = new Set<string>()
    const merged: ThingToDo[] = []
    for (const outcome of perType) {
      if (!outcome.ok) continue
      for (const item of outcome.places) {
        const key = item.name.toLowerCase()
        if (seen.has(key)) continue
        seen.add(key)
        merged.push(item)
      }
    }
    return { ok: true, places: merged }
  } catch (err) {
    logger.error('places search failed', err)
    return { ok: false }
  }
}

/**
 * Verifies a specific named venue against Google Places and returns the single
 * best real match near a coordinate, or null if nothing plausible is found.
 *
 * This is the grounding step for web-discovered venues: the model proposes a
 * name ("Mangy Moose Saloon"), and this confirms it's a real place, pins its
 * coordinates, and reads its rating/review count. A hallucinated or misremembered
 * name simply returns `{ ok: true, place: null }` and is dropped, so the pool
 * never gains a fake place. API failures return `{ ok: false }` so callers
 * can tell "not found" from "Places is down".
 *
 * @param name - The venue name the guide/model produced
 * @param lat - Trip centre latitude (search is biased here and far matches dropped)
 * @param lng - Trip centre longitude
 * @param apiKey - Google Places API key
 */
export async function findPlaceByName(
  name: string,
  lat: number,
  lng: number,
  apiKey: string,
): Promise<FindPlaceOutcome> {
  const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(name)}&location=${lat},${lng}&radius=${SEARCH_RADIUS_M}&key=${apiKey}`
  try {
    const res = await fetch(url)
    if (!res.ok) {
      logger.warn('findPlaceByName non-ok response', { status: res.status })
      return { ok: false }
    }
    const body = (await res.json()) as PlacesApiBody
    const parsed = parsePlacesApiBody(body, 'findPlaceByName')
    if (!parsed.ok) return { ok: false }
    const item = parsed.results[0]
    if (!item) return { ok: true, place: null }
    const plat = item.geometry?.location?.lat
    const plng = item.geometry?.location?.lng
    // Must have real coordinates and be within the trip's vicinity — a text
    // search for a name with no local match happily returns a same-named place
    // on another continent.
    if (plat == null || plng == null) return { ok: true, place: null }
    const category = categorizeTextResult(item.types ?? [])
    if (distanceKm(lat, lng, plat, plng) > maxKmFor(category)) return { ok: true, place: null }
    return {
      ok: true,
      place: {
        name: item.name,
        category,
        adultVenue: isAdultVenue({ name: item.name, category: '', types: item.types ?? [] }),
        source: 'places' as const,
        rating: item.rating,
        numReviews: item.user_ratings_total,
        address: item.vicinity ?? item.formatted_address,
        lat: plat,
        lng: plng,
        placeId: item.place_id,
      },
    }
  } catch (err) {
    logger.error('findPlaceByName failed', err)
    return { ok: false }
  }
}

/** Category for a free-text result: promote a real food/drink type, else the first type. */
/** How far out a result of this category may sit before it stops being useful. */
function maxKmFor(category: string): number {
  return isFoodCategory(category) ? FOOD_MAX_KM : TEXT_SEARCH_MAX_KM
}

function categorizeTextResult(types: string[]): string {
  return FOOD_TYPES.find((t) => types.includes(t)) ?? types.find((t) => t !== 'point_of_interest' && t !== 'establishment') ?? types[0] ?? 'attraction'
}

/**
 * Free-text Google Places search near a coordinate — "sushi restaurant",
 * "rooftop bar", "vegan cafe", etc. — so the chat can add ANY kind of place the
 * fixed nearby pool doesn't already cover. Returns real, correctly-typed
 * results (never fabricated). Body-level failures are `{ ok: false }`, not a
 * silent empty list, so callers that cache can refuse to poison their store.
 * @param query - The traveler's requested kind of place
 * @param lat - Latitude to bias the search toward
 * @param lng - Longitude to bias the search toward
 * @param apiKey - Google Places API key
 */
export async function textSearchPlaces(
  query: string,
  lat: number,
  lng: number,
  apiKey: string,
): Promise<PlacesSearchOutcome> {
  const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query)}&location=${lat},${lng}&radius=${SEARCH_RADIUS_M}&key=${apiKey}`
  try {
    const res = await fetch(url)
    if (!res.ok) {
      logger.warn('places text search non-ok response', { status: res.status })
      return { ok: false }
    }
    const body = (await res.json()) as PlacesApiBody
    const parsed = parsePlacesApiBody(body, 'textSearch')
    if (!parsed.ok) return { ok: false }
    const places = parsed.results
      .filter((item) => !(item.types ?? []).includes('lodging'))
      // Hard-drop results outside the trip's vicinity — text search only biases
      // toward the coordinate, so far-flung matches slip in without this.
      .filter((item) => {
        const plat = item.geometry?.location?.lat
        const plng = item.geometry?.location?.lng
        if (plat == null || plng == null) return false
        return distanceKm(lat, lng, plat, plng) <= maxKmFor(categorizeTextResult(item.types ?? []))
      })
      .slice(0, TEXT_SEARCH_LIMIT)
      .map((item) => ({
        name: item.name,
        category: categorizeTextResult(item.types ?? []),
        adultVenue: isAdultVenue({ name: item.name, category: '', types: item.types ?? [] }),
        source: 'places' as const,
        rating: item.rating,
        numReviews: item.user_ratings_total,
        address: item.vicinity ?? item.formatted_address,
        lat: item.geometry?.location?.lat,
        lng: item.geometry?.location?.lng,
        placeId: item.place_id,
      }))
    return { ok: true, places }
  } catch (err) {
    logger.error('places text search failed', err)
    return { ok: false }
  }
}
