import { z } from 'zod'
import type { Env } from '../lib/db'
import { getPlaceDetailCache, upsertPlaceDetailCache, countRecentRequests, insertRequestLog } from '../lib/db'
import { isUnderRateLimit, hashIp } from '../../src/lib/rateLimit'
import { PLACE_DETAILS_FIELDS, normalizePlaceDetail, type PlaceDetail } from '../lib/placeDetails'
import { logger } from '../../src/lib/logger'

// Details is a paid Google call, but cached per place, so the limit is
// generous enough for normal browsing while still capping abuse.
const RATE_LIMIT_PER_HOUR = 1200
// Refresh a cached place at most this often (30 days) — hours/phone rarely change.
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000

type PlaceEnv = Env & { GOOGLE_PLACES_API_KEY?: string }

const querySchema = z.object({
  placeId: z.string().min(1).max(300).optional(),
  name: z.string().min(1).max(200).optional(),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
})

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=86400' },
  })
}

/** Resolve a place_id from a free-text name (biased to lat/lng when given) via Find Place. */
async function resolvePlaceId(name: string, lat: number | undefined, lng: number | undefined, apiKey: string): Promise<string | null> {
  const bias = lat != null && lng != null ? `&locationbias=point:${lat},${lng}` : ''
  const url = `https://maps.googleapis.com/maps/api/place/findplacefromtext/json?input=${encodeURIComponent(name)}&inputtype=textquery&fields=place_id${bias}&key=${apiKey}`
  const res = await fetch(url)
  if (!res.ok) return null
  const body = (await res.json()) as { candidates?: { place_id?: string }[] }
  return body.candidates?.[0]?.place_id ?? null
}

/**
 * GET /api/place-details?placeId=...  (or ?name=...&lat=...&lng=...)
 *
 * Returns rich, real detail for a place — rating, review count, address, phone,
 * hours, a summary/reviews, photo references, and a Google Maps link — cached
 * in D1 so the paid Google Details call is made at most once per place
 * per 30 days. Nothing is fabricated; a place with no phone/hours simply omits
 * them. When only a name is given (e.g. an itinerary stop with no place_id) it
 * resolves the id via Find Place first.
 * @returns `PlaceDetail` JSON, or `{ error }` with 400/404/429/500
 */
export async function onRequestGet({ env, request }: { env: PlaceEnv; request: Request }): Promise<Response> {
  if (!env.GOOGLE_PLACES_API_KEY) return json({ error: 'place details not configured' }, 500)

  const url = new URL(request.url)
  const parsed = querySchema.safeParse({
    placeId: url.searchParams.get('placeId') ?? undefined,
    name: url.searchParams.get('name') ?? undefined,
    lat: url.searchParams.get('lat') ?? undefined,
    lng: url.searchParams.get('lng') ?? undefined,
  })
  if (!parsed.success || (!parsed.data.placeId && !parsed.data.name)) {
    return json({ error: 'placeId or name is required' }, 400)
  }

  try {
    const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown'
    const ipHash = await hashIp(ip, env.RATE_LIMIT_SALT)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    if (!isUnderRateLimit(await countRecentRequests(env, ipHash, oneHourAgo, 'place-details'), RATE_LIMIT_PER_HOUR)) {
      return json({ error: 'rate limit exceeded, try again later' }, 429)
    }

    const apiKey = env.GOOGLE_PLACES_API_KEY
    let placeId = parsed.data.placeId ?? null
    if (!placeId && parsed.data.name) {
      placeId = await resolvePlaceId(parsed.data.name, parsed.data.lat, parsed.data.lng, apiKey)
    }
    if (!placeId) return json({ error: 'place not found' }, 404)

    // Cache-first: serve a fresh cached row without touching Google.
    const cached = await getPlaceDetailCache(env, placeId)
    if (cached && cached.last_refreshed && Date.now() - new Date(cached.last_refreshed).getTime() < CACHE_TTL_MS) {
      return json(cached.detail, 200)
    }

    await insertRequestLog(env, ipHash, 'place-details')

    const detailsUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(placeId)}&fields=${PLACE_DETAILS_FIELDS}&key=${apiKey}`
    const res = await fetch(detailsUrl)
    if (!res.ok) {
      logger.error('place details non-ok', { status: res.status })
      // Fall back to a stale cache entry rather than failing the panel.
      if (cached) return json(cached.detail, 200)
      return json({ error: 'place details unavailable, try again' }, 502)
    }

    const body = (await res.json()) as { result?: unknown; status?: string }
    const detail: PlaceDetail | null = normalizePlaceDetail(body.result, placeId)
    if (!detail) {
      if (cached) return json(cached.detail, 200)
      return json({ error: 'place not found' }, 404)
    }

    await upsertPlaceDetailCache(env, { place_id: placeId, detail })
    return json(detail, 200)
  } catch (err) {
    logger.error('place-details failed', err)
    return json({ error: 'internal error' }, 500)
  }
}
