import type { ItineraryItem } from '../validation/schemas'
import type { DesignStyle } from '../../store/tripStore'
import { logger } from '../logger'

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
}

export interface Trip {
  id: string
  locationSlug: string
  itinerary: ItineraryItem[]
  designStyle: DesignStyle
}

function fromRow(row: {
  id: string
  location_slug: string
  itinerary: ItineraryItem[]
  design_style: DesignStyle
}): Trip {
  return { id: row.id, locationSlug: row.location_slug, itinerary: row.itinerary, designStyle: row.design_style }
}

export async function fetchLocation(query: string): Promise<LocationResult> {
  const res = await fetch(`/api/location?q=${encodeURIComponent(query)}`)
  const body = await res.json()
  if (!res.ok) throw new Error(body.error ?? 'failed to fetch location')
  return body
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
    return body.suggestions ?? []
  } catch (err) {
    logger.error('fetchAutocomplete failed', err)
    return []
  }
}

export async function createTrip(locationSlug: string): Promise<Trip> {
  const res = await fetch('/api/trips', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ location_slug: locationSlug }),
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
  patch: Partial<{ itinerary: ItineraryItem[]; designStyle: DesignStyle }>,
): Promise<Trip> {
  const res = await fetch(`/api/trips/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...(patch.itinerary ? { itinerary: patch.itinerary } : {}),
      ...(patch.designStyle ? { design_style: patch.designStyle } : {}),
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
