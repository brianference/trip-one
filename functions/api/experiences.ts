import { z } from 'zod'
import type { Env } from '../lib/db'
import {
  getViatorDestinationsCache,
  upsertViatorDestinationsCache,
  getViatorExperiencesCache,
  upsertViatorExperiencesCache,
} from '../lib/db'
import { isRateLimited } from '../lib/rateLimitGuard'
import {
  buildViatorDestinationsCacheKey,
  buildViatorExperiencesCacheKey,
  destinationIdString,
  DESTINATIONS_CACHE_TTL_MS,
  EXPERIENCES_CACHE_TTL_MS,
  fetchViatorDestinations,
  findNearestDestination,
  parseViatorDestinationsList,
  searchViatorExperiences,
  VIATOR_DEFAULT_CURRENCY,
  type ViatorDestination,
} from '../lib/viator'
import type { ThingToDo } from '../lib/mergeThingsToDo'
import { logger } from '../../src/lib/logger'

type ExperiencesEnv = Env & {
  VIATOR_API_KEY?: string
  VIATOR_PARTNER_ID?: string
  /** Optional Partner API base (sandbox or production). Not a secret. */
  VIATOR_API_BASE?: string
}

// Same hourly budget as interest-places: destinations (rare) + products/search
// + product details + one locations bulk is a handful of upstream calls per miss.
const RATE_LIMIT_PER_HOUR = 120

const requestSchema = z.object({
  lat: z.number().gte(-90).lte(90),
  lng: z.number().gte(-180).lte(180),
  currency: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{3}$/)
    .optional()
    .transform((v) => (v ? v.toUpperCase() : undefined)),
})

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

/**
 * Whether a destinations-cache row is still within the monthly refresh window.
 * Stale rows are treated as a miss so the taxonomy is re-fetched.
 * @param lastRefreshed - ISO timestamp from D1, if any
 */
function destinationsCacheIsFresh(lastRefreshed: string | undefined): boolean {
  if (!lastRefreshed) return false
  const t = Date.parse(lastRefreshed)
  if (!Number.isFinite(t)) return false
  return Date.now() - t < DESTINATIONS_CACHE_TTL_MS
}

/**
 * Whether an experiences-cache row is still within the 24h refresh window.
 * Prices and inventory change; without a TTL a successful write would serve
 * stale data forever (and an empty success would permanently hide new products).
 * Stale rows are treated as a miss — same pattern as destinationsCacheIsFresh.
 * @param lastRefreshed - ISO timestamp from D1, if any
 */
function experiencesCacheIsFresh(lastRefreshed: string | undefined): boolean {
  if (!lastRefreshed) return false
  const t = Date.parse(lastRefreshed)
  if (!Number.isFinite(t)) return false
  return Date.now() - t < EXPERIENCES_CACHE_TTL_MS
}

/**
 * POST /api/experiences
 *
 * Returns real bookable Viator experiences near the trip coordinates.
 * Destination-anchored (never free-text): free-text ranking returned Juneau
 * and Finnish Lapland for an Ely, Minnesota trip. We resolve the nearest
 * Viator destination by `center` within VIATOR_MAX_DESTINATION_KM, then search
 * that destination only — far-flung results become structurally impossible.
 *
 * Ordering matches interest-places on purpose:
 * 1. D1 cache BEFORE the rate-limit gate (a hit is a D1 read and must not
 *    spend the traveler's hourly budget).
 * 2. Rate limit on misses.
 * 3. Missing VIATOR_API_KEY → empty list with HTTP 200 (feature simply
 *    absent), not a 500, so this ships before the key exists.
 * 4. No nearby destination, API error, or bad shape → empty list with 200.
 *
 * @returns `{ experiences: ThingToDo[], cached?: boolean }`, or `{ error }` (400/429)
 */
export async function onRequestPost({
  env,
  request,
}: {
  env: ExperiencesEnv
  request: Request
}): Promise<Response> {
  const parsed = requestSchema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) {
    return json({ error: 'Something in that request didn’t look right. Please try again.' }, 400)
  }

  const { lat, lng } = parsed.data
  const currency = parsed.data.currency ?? VIATOR_DEFAULT_CURRENCY
  const destCacheKey = buildViatorDestinationsCacheKey()

  // Cache path: if destinations are already in D1 we can resolve the nearest
  // destination and serve a per-destination experiences hit WITHOUT fetch and
  // WITHOUT spending rate-limit budget. Destinations miss falls through to the
  // live path (we cannot know destinationId yet).
  let destinations: ViatorDestination[] | null = null
  try {
    const destRow = await getViatorDestinationsCache(env, destCacheKey)
    if (destRow && destinationsCacheIsFresh(destRow.last_refreshed)) {
      // Re-validate with Zod — never cast untrusted cache rows. A corrupt
      // cached destination (non-finite center) once beat real Juneau in
      // findNearestDestination (defect 4). Failed validation → cache miss.
      const validated = parseViatorDestinationsList(destRow.destinations)
      if (validated) destinations = validated
    }
  } catch (err) {
    logger.warn('viator destinations cache read failed; will try live path', {
      reason: err instanceof Error ? err.message : String(err),
    })
  }

  if (destinations) {
    const nearest = findNearestDestination(destinations, lat, lng)
    if (!nearest) {
      // Honest empty: no Viator coverage within range (rural / off-grid trips).
      return json({ experiences: [] }, 200)
    }
    // partnerId is in the key so rotating VIATOR_PARTNER_ID does not serve
    // 24h of booking URLs still tagged with the previous pid.
    const expKey = buildViatorExperiencesCacheKey(
      destinationIdString(nearest.destinationId),
      currency,
      env.VIATOR_PARTNER_ID,
    )
    try {
      const cached = await getViatorExperiencesCache(env, expKey)
      // Stale rows are a miss — prices move; permanent cache would freeze them.
      if (cached && experiencesCacheIsFresh(cached.last_refreshed)) {
        logger.info('viator experiences cache hit', { cacheKey: expKey })
        return json({ experiences: (cached.experiences as ThingToDo[]) ?? [], cached: true }, 200)
      }
    } catch (err) {
      logger.warn('viator experiences cache read failed; running a live search', {
        reason: err instanceof Error ? err.message : String(err),
      })
    }
  }

  if (await isRateLimited(env, request, 'experiences', RATE_LIMIT_PER_HOUR)) {
    return json(
      { error: 'You’ve made a lot of requests in a short time. Please wait a few minutes and try again.' },
      429,
    )
  }

  // Key absent → feature off. 200 + empty list (not 500) so the rest of the
  // trip still builds before the partner key is provisioned.
  if (!env.VIATOR_API_KEY) {
    return json({ experiences: [] }, 200)
  }

  try {
    // Optional sandbox/prod host override. Not a secret; resolve once so
    // destinations + products/search + detail + bulk all hit the same base.
    const apiBase = env.VIATOR_API_BASE

    if (!destinations) {
      const fetched = await fetchViatorDestinations(env.VIATOR_API_KEY, apiBase)
      if (fetched.length === 0) return json({ experiences: [] }, 200)
      destinations = fetched
      try {
        await upsertViatorDestinationsCache(env, {
          cache_key: destCacheKey,
          destinations: fetched,
        })
      } catch (err) {
        logger.warn('viator destinations cache write failed', {
          reason: err instanceof Error ? err.message : String(err),
        })
      }
    }

    const nearest = findNearestDestination(destinations, lat, lng)
    if (!nearest) {
      return json({ experiences: [] }, 200)
    }

    const destinationId = destinationIdString(nearest.destinationId)
    const expKey = buildViatorExperiencesCacheKey(destinationId, currency, env.VIATOR_PARTNER_ID)

    const searchResult = await searchViatorExperiences({
      destinationId,
      apiKey: env.VIATOR_API_KEY,
      partnerId: env.VIATOR_PARTNER_ID,
      currency,
      apiBase,
    })

    // Only cache a successful search. A genuine empty list is a real, stable
    // answer and SHOULD be cached; a transient failure (non-200, timeout, bad
    // JSON, shape mismatch, fetch throw) must NOT — otherwise one Viator 500
    // or 429 writes [] for that destination and every later request hits the
    // empty row forever. Same rule as interest-places.ts lines 106–110.
    if (!searchResult.ok) {
      return json({ experiences: [] }, 200)
    }

    const { experiences } = searchResult
    try {
      await upsertViatorExperiencesCache(env, { cache_key: expKey, experiences })
    } catch (err) {
      logger.warn('viator experiences cache write failed', {
        reason: err instanceof Error ? err.message : String(err),
      })
    }
    return json({ experiences }, 200)
  } catch (err) {
    logger.error('viator experiences failed', err)
    return json({ experiences: [] }, 200)
  }
}
