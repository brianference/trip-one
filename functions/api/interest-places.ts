import { z } from 'zod'
import type { Env } from '../lib/db'
import { getInterestPlacesCache, upsertInterestPlacesCache } from '../lib/db'
import { textSearchPlaces } from '../lib/places'
import { textSearchThingsToDo } from '../lib/tripadvisor'
import { isRateLimited } from '../lib/rateLimitGuard'
import { openAiResponseSchema } from '../lib/openAi'
import { buildInterestQueriesPrompt, normalizeInterestQueries } from '../lib/aiInterestQueries'
import { buildInterestCacheKey, PLACE_CACHE_VERSION } from '../lib/interestCache'
import { mergeThingsToDo, type ThingToDo } from '../lib/mergeThingsToDo'
import { dropCorruptNames } from '../lib/textIntegrity'
import { normalizeLocationSlug } from '../../src/lib/slug'
import { logger } from '../../src/lib/logger'

type InterestEnv = Env & {
  OPENAI_API_KEY?: string
  GOOGLE_PLACES_API_KEY?: string
  TRIPADVISOR_API_KEY?: string
  AI_MODEL?: string
}

// One AI call plus a handful of paid Places calls per request — gated tighter
// than the plain nearby search.
const RATE_LIMIT_PER_HOUR = 120
const DEFAULT_MODEL = 'gpt-4o-mini'
// Keep only the strongest few hits per query so one broad query ("park") can't
// crowd out a narrow one ("bait and tackle shop") in the merged pool.
const RESULTS_PER_QUERY = 6
// Below this many Google hits for a query, also try Tripadvisor — niche
// outdoor and thematic searches are exactly where Google's coverage thins out.
const GOOGLE_ENOUGH = 3

const requestSchema = z.object({
  // May be empty: a request can name a party and an occasion but no
  // activities. There is simply nothing to expand into searches then, so
  // return an empty list rather than failing the whole trip with a 400.
  interests: z.string().trim().max(300).optional().default(''),
  destination: z.string().trim().min(1).max(200),
  lat: z.number().gte(-90).lte(90),
  lng: z.number().gte(-180).lte(180),
})

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

/**
 * POST /api/interest-places
 *
 * Finds REAL places that serve what the traveler actually asked for.
 *
 * The nearby pool every trip is built from is a fixed attractions + food
 * search, so a request like "walleye fishing and ruffed grouse hunting" had
 * nothing in it to plan around and the itinerary filled up with restaurants.
 * This expands the interests into the searches a local would run ("fishing
 * guide service", "boat launch", "wildlife management area") and returns the
 * real results.
 *
 * Grounding is preserved: the model only writes SEARCH QUERIES, never place
 * names. Every returned place is a real Places/Tripadvisor result.
 *
 * The result is cached in D1 by destination + interests, so a repeat trip to
 * the same place with the same interests reuses it and pays for neither the AI
 * call nor the Places calls. A cache hit skips the rate-limit gate too, since
 * it costs nothing to serve.
 *
 * Fails soft — an empty list just means the trip falls back to the nearby
 * pool, so a bad AI response degrades the plan rather than breaking it.
 * @returns `{ places: ThingToDo[], queries: string[], cached? }`, or `{ error }` (400/429/500)
 */
export async function onRequestPost({ env, request }: { env: InterestEnv; request: Request }): Promise<Response> {
  if (!env.OPENAI_API_KEY || !env.GOOGLE_PLACES_API_KEY) {
    return json({ error: 'interest search is not configured' }, 500)
  }

  const parsed = requestSchema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) return json({ error: 'invalid request' }, 400)

  const { interests, destination, lat, lng } = parsed.data

  // Nothing to search for. The trip still works: it falls back to the nearby
  // pool and to web-grounded discovery, both of which handle an empty intent.
  if (interests === '') return json({ places: [], queries: [] }, 200)

  // Cache lookup comes BEFORE the rate-limit gate: a hit costs nothing to
  // serve (a single D1 read, no AI or Places calls), so it shouldn't spend a
  // request against the traveler's hourly budget. A cache read that fails just
  // falls through to a live search rather than breaking the trip.
  const cacheKey = await buildInterestCacheKey(normalizeLocationSlug(destination), `${PLACE_CACHE_VERSION}|${interests}`)
  try {
    const cached = await getInterestPlacesCache(env, cacheKey)
    if (cached) {
      logger.info('interest places cache hit', { cacheKey })
      return json({ places: cached.places ?? [], queries: cached.queries ?? [], cached: true }, 200)
    }
  } catch (err) {
    logger.warn('interest places cache read failed; running a live search', {
      reason: err instanceof Error ? err.message : String(err),
    })
  }

  if (await isRateLimited(env, request, 'interest-places', RATE_LIMIT_PER_HOUR)) {
    return json({ error: 'rate limit exceeded, try again later' }, 429)
  }

  // Stores a computed result and returns it. Only reached after a successful
  // AI call, so a real (possibly empty) result is cached; transient failures
  // below return WITHOUT caching, so a one-off OpenAI hiccup never poisons the
  // cache with an empty list. The write is soft — a cache failure still serves
  // the freshly-computed result.
  const cacheAndRespond = async (places: ThingToDo[], queries: string[]): Promise<Response> => {
    try {
      await upsertInterestPlacesCache(env, { cache_key: cacheKey, places, queries })
    } catch (err) {
      logger.warn('interest places cache write failed', {
        reason: err instanceof Error ? err.message : String(err),
      })
    }
    return json({ places, queries }, 200)
  }

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: env.AI_MODEL ?? DEFAULT_MODEL,
        messages: [{ role: 'user', content: buildInterestQueriesPrompt(interests, destination) }],
        response_format: { type: 'json_object' },
        temperature: 0.2,
        max_tokens: 300,
      }),
    })
    if (!res.ok) {
      logger.warn('interest-places openai non-ok', { status: res.status })
      return json({ places: [], queries: [] }, 200)
    }

    const bodyParsed = openAiResponseSchema.safeParse(await res.json())
    if (!bodyParsed.success) return json({ places: [], queries: [] }, 200)

    let raw: unknown
    try {
      raw = JSON.parse(bodyParsed.data.choices[0].message.content)
    } catch {
      return json({ places: [], queries: [] }, 200)
    }

    const queries = normalizeInterestQueries(raw)
    // A genuinely vague request ("relaxed", "fun") yields no queries — that's a
    // real, stable result worth caching so it doesn't re-run the AI next time.
    if (queries.length === 0) return cacheAndRespond([], [])

    const perQuery = await Promise.all(
      queries.map(async (q) => {
        const found = await textSearchPlaces(q, lat, lng, env.GOOGLE_PLACES_API_KEY as string)
        if (found.length >= GOOGLE_ENOUGH || !env.TRIPADVISOR_API_KEY) return found.slice(0, RESULTS_PER_QUERY)
        const fromTa = await textSearchThingsToDo(q, lat, lng, env.TRIPADVISOR_API_KEY)
        return mergeThingsToDo(fromTa, found).slice(0, RESULTS_PER_QUERY)
      }),
    )

    // Interleave one result per query before taking seconds, so every interest
    // the traveler named is represented even if one query returns far more.
    const seen = new Set<string>()
    const places: ThingToDo[] = []
    const depth = Math.max(0, ...perQuery.map((r) => r.length))
    for (let rank = 0; rank < depth; rank += 1) {
      for (const results of perQuery) {
        const item = results[rank]
        if (!item) continue
        const key = item.name.trim().toLowerCase()
        if (key === '' || seen.has(key)) continue
        seen.add(key)
        places.push(item)
      }
    }

    logger.info('interest places found', { queries: queries.length, places: places.length })
    return cacheAndRespond(dropCorruptNames(places), queries)
  } catch (err) {
    logger.error('interest places failed', err)
    return json({ places: [], queries: [] }, 200)
  }
}
