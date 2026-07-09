import type { ThingToDo } from '../../../lib/api/client'
import type { PlaceQuery } from './usePlaceDetail'

/**
 * Builds the lookup for a place's detail panel. Prefer the Google place_id
 * (Places-sourced suggestions carry one — an exact, unambiguous match); fall
 * back to name + coordinates so entries without an id (e.g. Tripadvisor
 * suggestions, itinerary stops) still resolve via Find Place.
 */
export function placeQueryFor(item: { name: string; placeId?: string; lat?: number; lng?: number }): PlaceQuery {
  return { label: item.name, placeId: item.placeId, name: item.name, lat: item.lat, lng: item.lng }
}

/** Convenience for a ThingToDo suggestion. */
export function placeQueryForThing(item: ThingToDo): PlaceQuery {
  return placeQueryFor(item)
}
