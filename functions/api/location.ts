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
import { anyNameCorrupt, dropCorruptNames } from '../lib/textIntegrity'
import { logger } from '../../src/lib/logger'

const RATE_LIMIT_PER_HOUR = 200

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
    // A cached row with zero things-to-do is treated as a cache miss and
    // refreshed below, rather than trusted forever: it's almost always a
    // location cached before the Tripadvisor/Places integration existed (or
    // one whose search legitimately failed at the time), not a real place
    // with nothing nearby. Likewise, a row whose Places-sourced entries have
    // no lat/lng predates the per-item-coordinate capture added later in the
    // same integration — those never self-heal on their own since they do
    // have real, non-empty things-to-do, just missing a field added after
    // they were cached — so a places-sourced item lacking lat/lng also
    // triggers a refresh.
    const cachedThingsToDo = Array.isArray(cached?.things_to_do)
      ? (cached.things_to_do as Array<{ name?: string; source?: string; lat?: number; category?: string }>)
      : []
    const placesEntriesLackCoordinates =
      cachedThingsToDo.some((item) => item.source === 'places') &&
      !cachedThingsToDo.some((item) => item.source === 'places' && item.lat != null)
    // A row with no restaurant/food entry predates adding the restaurant
    // search to Google Places — refresh it so the itinerary can schedule
    // real meals, the same way the coordinate self-heal above works.
    const hasNoRestaurant = !cachedThingsToDo.some((item) => /restaurant|cafe|food|dining|bakery|bar/i.test(item.category ?? ''))
    // A row with mojibake place names (garbled UTF-8 from an earlier import,
    // e.g. "故宫\uDC8D物院") self-heals the same way: re-fetch from Google
    // Places, whose spec-compliant JSON decode yields clean names. Without this
    // the cache-hit conditions above are all satisfied, so a corrupt row would
    // be served forever.
    const namesAreCorrupt = anyNameCorrupt(cachedThingsToDo)
    if (cached && cachedThingsToDo.length > 0 && !placesEntriesLackCoordinates && !hasNoRestaurant && !namesAreCorrupt) {
      // The dedicated weather_baseline column has never stored weather data
      // (see supabaseAdmin.ts) — it's repurposed here to carry the geocoded
      // bounding box so a fresh Nominatim call isn't needed just to zoom the
      // map to a place's real extent.
      const baseline = cached.weather_baseline as { boundingBox?: [number, number, number, number] } | null
      return json(
        {
          slug: cached.slug,
          lat: cached.lat,
          lng: cached.lng,
          displayName: cached.display_name,
          thingsToDo: cachedThingsToDo,
          boundingBox: baseline?.boundingBox,
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
    // Drop any place whose name is mojibake before caching or returning it — a
    // place we can't name correctly is better omitted than shown garbled, and
    // this keeps a healed row from tripping the self-heal check on its next hit.
    const thingsToDo = dropCorruptNames(mergeThingsToDo(tripadvisorResults, placesResults))

    await upsertLocation(env, {
      slug,
      lat: geo.lat,
      lng: geo.lng,
      display_name: geo.displayName,
      things_to_do: thingsToDo,
      weather_baseline: geo.boundingBox ? { boundingBox: geo.boundingBox } : null,
    })
    logger.info('generated new location', { slug })

    return json(
      { slug, lat: geo.lat, lng: geo.lng, displayName: geo.displayName, thingsToDo, boundingBox: geo.boundingBox },
      200,
    )
  } catch (err) {
    logger.error('location lookup failed', err)
    return json({ error: 'internal error' }, 500)
  }
}
