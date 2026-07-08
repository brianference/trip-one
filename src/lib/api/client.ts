import type { ItineraryItem } from '../validation/schemas'
import type { DesignStyle } from '../../store/tripStore'
import { logger } from '../logger'
import { cleanDisplayName } from '../location/displayName'

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
  // cached and new locations alike without a data migration.
  return { ...body, displayName: cleanDisplayName(body.displayName) }
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
    return suggestions.map((s) => ({ ...s, displayName: cleanDisplayName(s.displayName) }))
  } catch (err) {
    logger.error('fetchAutocomplete failed', err)
    return []
  }
}

export interface PlanDay {
  day: number
  placeIndexes: number[]
}

/**
 * Ask the grounded AI planner to build a day-by-day plan from the trip's real
 * nearby places. The backend LLM may only reference indices into `places`, so
 * the returned plan can only contain places that actually exist.
 * @param intent - Free-text traveler request, e.g. "3 relaxed days, love food"
 * @param days - Trip length to plan for
 * @param places - The real candidate places (index order is meaningful — the
 * returned `placeIndexes` map back into this array)
 * @returns Day-grouped indices into `places`
 * @throws If the request is invalid, rate limited, or the planner fails
 */
export async function generatePlan(
  intent: string,
  days: number,
  places: { name: string; category: string; rating?: number }[],
): Promise<PlanDay[]> {
  const res = await fetch('/api/plan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ intent, days, places }),
  })
  const body = await res.json()
  if (!res.ok) throw new Error(body.error ?? 'failed to generate a plan')
  return body.days
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
