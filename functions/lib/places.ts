import type { ThingToDo } from './mergeThingsToDo'
import { logger } from '../../src/lib/logger'

/**
 * Search the Google Places (Nearby Search) API for tourist attractions near a coordinate.
 * Fails soft: any non-ok response or thrown error yields an empty array
 * rather than propagating, since Tripadvisor results can stand in on their own.
 * @param lat - Latitude to search near
 * @param lng - Longitude to search near
 * @param apiKey - Google Places API key
 * @returns A list of things to do, or an empty array on failure
 */
export async function searchPlaces(lat: number, lng: number, apiKey: string): Promise<ThingToDo[]> {
  try {
    const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=8000&type=tourist_attraction&key=${apiKey}`
    const res = await fetch(url)
    if (!res.ok) {
      logger.warn('places search non-ok response', { status: res.status })
      return []
    }
    const body = (await res.json()) as {
      results: Array<{
        name: string
        types: string[]
        rating?: number
        vicinity?: string
        geometry?: { location?: { lat?: number; lng?: number } }
      }>
    }
    return (body.results ?? []).map((item) => ({
      name: item.name,
      category: item.types[0] ?? 'attraction',
      source: 'places' as const,
      rating: item.rating,
      address: item.vicinity,
      lat: item.geometry?.location?.lat,
      lng: item.geometry?.location?.lng,
    }))
  } catch (err) {
    logger.error('places search failed', err)
    return []
  }
}
