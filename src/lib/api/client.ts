import type { ItineraryItem } from '../validation/schemas'
import type { DesignStyle } from '../../store/tripStore'
import { logger } from '../logger'
import { cleanDisplayName } from '../location/displayName'
import { isExperienceCategory } from '../location/experienceFilter'

export interface ThingToDo {
  name: string
  category: string
  source: 'tripadvisor' | 'places'
  rating?: number
  address?: string
  /**
   * Per-item coordinates, present only for `places`-sourced entries (Google
   * Places' Nearby Search response includes them per result). Tripadvisor's
   * `nearby_search` endpoint doesn't return per-item lat/long, so those
   * entries omit these fields rather than fabricating a value.
   */
  lat?: number
  lng?: number
  /** Google Places place_id, present for `places`-sourced entries. Used to fetch rich detail. */
  placeId?: string
}

export interface LocationResult {
  slug: string
  lat: number
  lng: number
  displayName: string
  thingsToDo: ThingToDo[]
  /**
   * [south, north, west, east], from the upstream geocoder. Present for most
   * real places; absent for a handful of point-only results. Used to zoom
   * the map to the place's real extent instead of a fixed zoom level, so a
   * whole country or island shows its actual shape rather than a tight,
   * arbitrary crop around its geometric center.
   */
  boundingBox?: [number, number, number, number]
}

export interface Trip {
  id: string
  locationSlug: string
  itinerary: ItineraryItem[]
  designStyle: DesignStyle
  /** Total number of days the traveler plans for this trip, or null/absent if not set yet. */
  tripLengthDays?: number | null
}

function fromRow(row: {
  id: string
  location_slug: string
  itinerary: ItineraryItem[]
  design_style: DesignStyle
  trip_length_days?: number | null
}): Trip {
  return {
    id: row.id,
    locationSlug: row.location_slug,
    itinerary: row.itinerary,
    designStyle: row.design_style,
    tripLengthDays: row.trip_length_days ?? null,
  }
}

export async function fetchLocation(query: string): Promise<LocationResult> {
  const res = await fetch(`/api/location?q=${encodeURIComponent(query)}`)
  const body = await res.json()
  if (!res.ok) throw new Error(body.error ?? 'failed to fetch location')
  // Trim the geocoder's full admin chain to a clean "City, Region" here, at
  // the one boundary every display path flows through, so it applies to
  // cached and new locations alike without a data migration. Also drop
  // service/utility noise (hotels, gyms, ATMs) so the things-to-do list, map,
  // and AI candidate pool only contain real experiences.
  const thingsToDo: ThingToDo[] = (body.thingsToDo ?? []).filter((t: ThingToDo) => isExperienceCategory(t.category))
  return { ...body, displayName: cleanDisplayName(body.displayName), thingsToDo }
}

export interface AutocompleteSuggestion {
  displayName: string
  lat: number
  lng: number
}

/**
 * Fetch partial-text location suggestions for autocomplete. Fails soft: on any
 * error (network failure, non-ok response), returns an empty array instead of
 * throwing, since autocomplete is a non-essential enhancement over the "Go" flow.
 * @param query - Partial free-text location, e.g. "dublin"
 * @returns Matching suggestions (may be empty)
 */
export async function fetchAutocomplete(query: string): Promise<AutocompleteSuggestion[]> {
  try {
    const res = await fetch(`/api/autocomplete?q=${encodeURIComponent(query)}`)
    if (!res.ok) return []
    const body = await res.json()
    const suggestions: AutocompleteSuggestion[] = body.suggestions ?? []
    // Clean each label, then drop duplicates. The geocoder often returns
    // several admin entries for a query like "hawaii" (the state, the county,
    // the island) that all clean to the same "Hawaii" — showing it five times
    // is useless, so keep only the first (highest-importance) of each name.
    const seen = new Set<string>()
    const cleaned: AutocompleteSuggestion[] = []
    for (const s of suggestions) {
      const displayName = cleanDisplayName(s.displayName)
      const key = displayName.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      cleaned.push({ ...s, displayName })
    }
    return cleaned
  } catch (err) {
    logger.error('fetchAutocomplete failed', err)
    return []
  }
}

export interface PlanDay {
  day: number
  placeIndexes: number[]
}

/** One turn of the itinerary planning conversation. */
export interface PlanTurn {
  role: 'user' | 'assistant'
  content: string
}

/** The current itinerary summarized for the planner, so chat edits build on it. */
export interface CurrentPlanDay {
  day: number
  placeNames: string[]
}

/** A grounded plan plus the planner's friendly natural-language reply. */
export interface PlanResult {
  days: PlanDay[]
  message: string
}

/** One conversational turn: a re-plan, a plain answer, or a request to switch destination. */
export interface ChatResult {
  action: 'plan' | 'answer' | 'relocate'
  message: string
  days: PlanDay[] | null
  /** For `relocate`: the new destination to switch the trip to. */
  destination: string | null
}

/**
 * Send one conversational turn to the trip assistant. The backend decides
 * whether the message is a plan edit, a question, or a request to visit a
 * different destination: for a plan it returns grounded `days` to apply; for a
 * question it returns only a `message`; for a relocate it returns a
 * `destination` to rebuild the trip around.
 * @param message - The traveler's latest message
 * @param days - Trip length to plan for
 * @param places - The real candidate places (index order maps to returned `days`)
 * @param opts - Current destination name, itinerary (by day), and prior conversation
 * @throws If the request is invalid, rate limited, or the assistant fails
 */
export async function sendChat(
  message: string,
  days: number,
  places: { name: string; category: string; rating?: number }[],
  opts?: { locationName?: string; itinerary?: CurrentPlanDay[]; conversation?: PlanTurn[] },
): Promise<ChatResult> {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, days, places, locationName: opts?.locationName, itinerary: opts?.itinerary, conversation: opts?.conversation }),
  })
  const body = await res.json()
  if (!res.ok) throw new Error(body.error ?? 'failed to reach the assistant')
  const action = body.action === 'plan' || body.action === 'relocate' ? body.action : 'answer'
  return { action, message: typeof body.message === 'string' ? body.message : '', days: body.days ?? null, destination: body.destination ?? null }
}

export interface TripIntent {
  /** The destination named in the request, or null if none could be found. */
  destination: string | null
  /** The stated trip length, or null if unspecified. */
  days: number | null
  /** A short interests/pace phrase to feed the planner. */
  interests: string
}

/**
 * Parse a free-text trip request ("a fun 9-day San Diego trip with kids") into
 * a destination, day count, and interests, so the homepage can turn one
 * sentence into a real trip.
 * @param text - The traveler's free-text request
 * @throws If the request is invalid, rate limited, or extraction fails
 */
export async function extractTripIntent(text: string): Promise<TripIntent> {
  const res = await fetch('/api/plan-intent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  })
  const body = await res.json()
  if (!res.ok) throw new Error(body.error ?? 'failed to understand your request')
  return body
}

/**
 * Ask the grounded AI planner to build (or, with conversation/currentPlan,
 * revise) a day-by-day plan from the trip's real nearby places. The backend
 * LLM may only reference indices into `places`, so the returned plan can only
 * contain places that actually exist. It also returns a friendly reply.
 * @param intent - Free-text traveler request, e.g. "3 relaxed days, love food"
 * @param days - Trip length to plan for
 * @param places - The real candidate places (index order is meaningful — the
 * returned `placeIndexes` map back into this array)
 * @param opts - Optional conversation history and current itinerary for
 * conversational edits (the itinerary chat)
 * @returns The grounded plan and the planner's message
 * @throws If the request is invalid, rate limited, or the planner fails
 */
export async function generatePlan(
  intent: string,
  days: number,
  places: { name: string; category: string; rating?: number }[],
  opts?: { conversation?: PlanTurn[]; currentPlan?: CurrentPlanDay[] },
): Promise<PlanResult> {
  const res = await fetch('/api/plan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ intent, days, places, ...opts }),
  })
  const body = await res.json()
  if (!res.ok) throw new Error(body.error ?? 'failed to generate a plan')
  return { days: body.days, message: typeof body.message === 'string' ? body.message : '' }
}

export interface PlaceReview {
  author: string
  rating: number | null
  text: string
  relativeTime: string
}

/** Rich, real detail for a place (from Google Place Details, server-cached). */
export interface PlaceDetail {
  placeId: string
  name: string
  address: string | null
  phone: string | null
  rating: number | null
  reviewCount: number | null
  priceLevel: number | null
  website: string | null
  mapsUrl: string | null
  openNow: boolean | null
  hours: string[]
  summary: string | null
  reviews: PlaceReview[]
  photoRefs: string[]
  serves: string[]
  types: string[]
}

/** URL for a place photo, proxied through the backend so the API key stays server-side. */
export function placePhotoUrl(ref: string, width = 400): string {
  return `/api/place-photo?ref=${encodeURIComponent(ref)}&w=${width}`
}

// Per-session cache of place-detail lookups (keyed by the query). The result
// is already server-cached in Supabase, but this also avoids a duplicate
// network round-trip when the same place is opened twice — e.g. from the map
// and then from the things-to-do list. Stores the in-flight promise so two
// near-simultaneous opens share one request.
const placeDetailCache = new Map<string, Promise<PlaceDetail>>()

/**
 * Fetch rich detail for a place — by `placeId` when known (Places-sourced
 * suggestions carry one), else by `name` + coordinates (itinerary stops).
 * Deduplicated per session so reopening the same place doesn't refetch.
 * @throws If the place can't be found or the request fails
 */
export async function fetchPlaceDetails(params: { placeId?: string; name?: string; lat?: number; lng?: number }): Promise<PlaceDetail> {
  const qs = new URLSearchParams()
  if (params.placeId) qs.set('placeId', params.placeId)
  if (params.name) qs.set('name', params.name)
  if (params.lat != null) qs.set('lat', String(params.lat))
  if (params.lng != null) qs.set('lng', String(params.lng))
  const key = qs.toString()

  const cached = placeDetailCache.get(key)
  if (cached) return cached

  const promise = (async () => {
    const res = await fetch(`/api/place-details?${key}`)
    const body = await res.json()
    if (!res.ok) throw new Error(body.error ?? 'failed to load place details')
    return body as PlaceDetail
  })()
  // Cache the in-flight promise; drop it on failure so errors can be retried.
  placeDetailCache.set(key, promise)
  promise.catch(() => placeDetailCache.delete(key))
  return promise
}

export async function createTrip(locationSlug: string, designStyle?: DesignStyle): Promise<Trip> {
  const res = await fetch('/api/trips', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ location_slug: locationSlug, design_style: designStyle }),
  })
  const body = await res.json()
  if (!res.ok) throw new Error(body.error ?? 'failed to create trip')
  return fromRow(body)
}

export async function getTrip(id: string): Promise<Trip> {
  const res = await fetch(`/api/trips/${id}`)
  const body = await res.json()
  if (!res.ok) throw new Error(body.error ?? 'failed to load trip')
  return fromRow(body)
}

export async function updateTrip(
  id: string,
  patch: Partial<{ itinerary: ItineraryItem[]; designStyle: DesignStyle; tripLengthDays: number | null }>,
): Promise<Trip> {
  const res = await fetch(`/api/trips/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...(patch.itinerary ? { itinerary: patch.itinerary } : {}),
      ...(patch.designStyle ? { design_style: patch.designStyle } : {}),
      ...(patch.tripLengthDays !== undefined ? { trip_length_days: patch.tripLengthDays } : {}),
    }),
  })
  const body = await res.json()
  if (!res.ok) throw new Error(body.error ?? 'failed to update trip')
  return fromRow(body)
}

/**
 * Fork a trip by copying its location and itinerary into a brand-new trip.
 * Used whenever a user edits a read-only demo trip, so the shared demo row
 * is never mutated.
 */
export async function forkTrip(sourceTripId: string): Promise<Trip> {
  const source = await getTrip(sourceTripId)
  const forked = await createTrip(source.locationSlug)
  return updateTrip(forked.id, { itinerary: source.itinerary, designStyle: source.designStyle })
}
