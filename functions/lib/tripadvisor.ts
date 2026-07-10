import type { ThingToDo } from './mergeThingsToDo'
import { logger } from '../../src/lib/logger'

/**
 * Search the Tripadvisor content API for attractions near a coordinate.
 * Fails soft: any non-ok response or thrown error yields an empty array
 * rather than propagating, since Places results can stand in on their own.
 * @param slug - The normalized location slug, used only for log context
 * @param lat - Latitude to search near
 * @param lng - Longitude to search near
 * @param apiKey - Tripadvisor content API key
 * @returns A list of things to do, or an empty array on failure
 */
export async function searchThingsToDo(
  slug: string,
  lat: number,
  lng: number,
  apiKey: string,
): Promise<ThingToDo[]> {
  try {
    const url = `https://api.content.tripadvisor.com/api/v1/location/nearby_search?key=${apiKey}&latLong=${lat}%2C${lng}&category=attractions`
    const res = await fetch(url, { headers: { Accept: 'application/json' } })
    if (!res.ok) {
      logger.warn('tripadvisor search non-ok response', { slug, status: res.status })
      return []
    }
    const body = (await res.json()) as { data: Array<{ name: string; category?: { name: string }; rating?: string }> }
    return (body.data ?? []).map((item) => ({
      name: item.name,
      category: item.category?.name ?? 'attraction',
      source: 'tripadvisor' as const,
      rating: item.rating ? Number(item.rating) : undefined,
    }))
  } catch (err) {
    logger.error('tripadvisor search failed', err)
    return []
  }
}

// How many text-search hits to enrich with coordinates (each costs a details call).
const TA_TEXT_ENRICH = 6

/**
 * Free-text Tripadvisor search near a coordinate ("space museum", "planetarium"),
 * used as a fallback when Google Places text search comes up short. The search
 * endpoint returns names + ids only, so the top hits are enriched with a details
 * call to get real coordinates/rating (so they can go on the map). Fails soft to
 * an empty array.
 * @param query - The kind/theme of place to find
 * @param lat - Latitude to bias toward
 * @param lng - Longitude to bias toward
 * @param apiKey - Tripadvisor content API key
 */
export async function textSearchThingsToDo(query: string, lat: number, lng: number, apiKey: string): Promise<ThingToDo[]> {
  try {
    const searchUrl = `https://api.content.tripadvisor.com/api/v1/location/search?key=${apiKey}&searchQuery=${encodeURIComponent(query)}&latLong=${lat}%2C${lng}&language=en`
    const res = await fetch(searchUrl, { headers: { Accept: 'application/json' } })
    if (!res.ok) {
      logger.warn('tripadvisor text search non-ok response', { status: res.status })
      return []
    }
    const body = (await res.json()) as { data?: Array<{ location_id: string; name: string }> }
    const top = (body.data ?? []).slice(0, TA_TEXT_ENRICH)

    const detailed = await Promise.all(
      top.map(async (loc): Promise<ThingToDo | null> => {
        try {
          const detailUrl = `https://api.content.tripadvisor.com/api/v1/location/${loc.location_id}/details?key=${apiKey}&language=en`
          const detailRes = await fetch(detailUrl, { headers: { Accept: 'application/json' } })
          if (!detailRes.ok) return null
          const d = (await detailRes.json()) as { latitude?: string | number; longitude?: string | number; rating?: string; category?: { name: string } }
          const latNum = d.latitude != null ? Number(d.latitude) : undefined
          const lngNum = d.longitude != null ? Number(d.longitude) : undefined
          return {
            name: loc.name,
            category: d.category?.name ?? 'attraction',
            source: 'tripadvisor' as const,
            rating: d.rating ? Number(d.rating) : undefined,
            lat: Number.isFinite(latNum) ? latNum : undefined,
            lng: Number.isFinite(lngNum) ? lngNum : undefined,
          }
        } catch {
          return null
        }
      }),
    )
    return detailed.filter((x): x is ThingToDo => x !== null)
  } catch (err) {
    logger.error('tripadvisor text search failed', err)
    return []
  }
}
