import type { ItineraryItem } from '../validation/schemas'
import type { DesignStyle } from '../../store/tripStore'

export interface ThingToDo {
  name: string
  category: string
  source: 'tripadvisor' | 'places'
  rating?: number
  address?: string
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
