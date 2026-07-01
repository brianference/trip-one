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
    const url = `https://api.content.tripadvisor.com/api/v1/location/search?key=${apiKey}&latLong=${lat}%2C${lng}&category=attractions`
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
