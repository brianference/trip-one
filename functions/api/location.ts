import type { Env } from '../lib/supabaseAdmin'
import {
  getLocationBySlug,
  upsertLocation,
  countRecentRequests,
  insertRequestLog,
} from '../lib/supabaseAdmin'
import { normalizeLocationSlug } from '../../src/lib/slug'
import { isUnderRateLimit, hashIp } from '../../src/lib/rateLimit'
import { locationQuerySchema } from '../../src/lib/validation/schemas'
import { geocode } from '../lib/geocode'
import { searchThingsToDo } from '../lib/tripadvisor'
import { searchPlaces } from '../lib/places'
import { mergeThingsToDo } from '../lib/mergeThingsToDo'
import { logger } from '../../src/lib/logger'

const RATE_LIMIT_PER_HOUR = 20

type LocationEnv = Env & { TRIPADVISOR_API_KEY: string; GOOGLE_PLACES_API_KEY: string }

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

/**
 * GET /api/location?q=<query>
 *
 * Resolves a free-text location query to coordinates and a list of things to do,
 * using a Supabase-backed cache keyed by a normalized slug. On a cache miss,
 * enforces a per-IP hourly rate limit before calling out to Nominatim (geocode),
 * Tripadvisor, and Google Places, then persists the merged result for future hits.
 * @param context - Request context with `env` (bindings/secrets) and `request`
 * @returns JSON response: `{ slug, lat, lng, displayName, thingsToDo }` on success,
 * or `{ error }` with 400 (invalid query), 404 (location not found), or 429 (rate limited)
 */
export async function onRequestGet({
  env,
  request,
}: {
  env: LocationEnv
  request: Request
}): Promise<Response> {
  const q = new URL(request.url).searchParams.get('q') ?? ''
  const parsed = locationQuerySchema.safeParse(q)
  if (!parsed.success) return json({ error: 'invalid query' }, 400)

  try {
    const slug = normalizeLocationSlug(parsed.data)
    const cached = await getLocationBySlug(env, slug)
    if (cached) {
      return json(
        {
          slug: cached.slug,
          lat: cached.lat,
          lng: cached.lng,
          displayName: cached.display_name,
          thingsToDo: cached.things_to_do ?? [],
        },
        200,
      )
    }

    const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown'
    const ipHash = await hashIp(ip, env.RATE_LIMIT_SALT)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    const recentCount = await countRecentRequests(env, ipHash, oneHourAgo)
    if (!isUnderRateLimit(recentCount, RATE_LIMIT_PER_HOUR)) {
      return json({ error: 'rate limit exceeded, try again later' }, 429)
    }
    await insertRequestLog(env, ipHash, 'location')

    const geo = await geocode(parsed.data)
    if (!geo) return json({ error: 'location not found' }, 404)

    const [tripadvisorResults, placesResults] = await Promise.all([
      searchThingsToDo(slug, geo.lat, geo.lng, env.TRIPADVISOR_API_KEY),
      searchPlaces(geo.lat, geo.lng, env.GOOGLE_PLACES_API_KEY),
    ])
    const thingsToDo = mergeThingsToDo(tripadvisorResults, placesResults)

    await upsertLocation(env, {
      slug,
      lat: geo.lat,
      lng: geo.lng,
      display_name: geo.displayName,
      things_to_do: thingsToDo,
    })
    logger.info('generated new location', { slug })

    return json({ slug, lat: geo.lat, lng: geo.lng, displayName: geo.displayName, thingsToDo }, 200)
  } catch (err) {
    logger.error('location lookup failed', err)
    return json({ error: 'internal error' }, 500)
  }
}
