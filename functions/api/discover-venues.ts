import { z } from 'zod'
import type { Env } from '../lib/db'
import { getInterestPlacesCache, upsertInterestPlacesCache } from '../lib/db'
import { findPlaceByName } from '../lib/places'
import { isRateLimited } from '../lib/rateLimitGuard'
import { openAiResponseSchema } from '../lib/openAi'
import { buildDiscoverPrompt, normalizeDiscoveredVenues, discoveredVenuesForDays, describeInterests, type TravelerProfile } from '../lib/aiDiscover'
import { buildInterestCacheKey, PLACE_CACHE_VERSION } from '../lib/interestCache'
import { gatherGuideContent } from '../lib/webSearch'
import { isRequestedExperienceCategory } from '../../src/lib/location/experienceFilter'
import type { ThingToDo } from '../lib/mergeThingsToDo'
import { dropCorruptNames } from '../lib/textIntegrity'
import { normalizeLocationSlug } from '../../src/lib/slug'
import { logger } from '../../src/lib/logger'

type DiscoverEnv = Env & {
  OPENAI_API_KEY?: string
  GOOGLE_PLACES_API_KEY?: string
  BRAVE_API?: string
  AI_MODEL?: string
}

// One web search + a few page fetches + one AI call + up to 30 Places
// verifications per request — the most expensive endpoint, gated tightest.
const RATE_LIMIT_PER_HOUR = 60
const DEFAULT_MODEL = 'gpt-4o-mini'

const requestSchema = z.object({
  destination: z.string().trim().min(1).max(200),
  // May be empty: a request can name a party and an occasion but no activities
  // ("a father and son, the son is turning 21"). The profile still describes the
  // trip, so discovery derives interests from it rather than rejecting.
  interests: z.string().trim().max(300).optional().default(''),
  days: z.number().int().min(1).max(30).optional(),
  party: z.string().trim().max(120).optional(),
  occasion: z.string().trim().max(120).nullable().optional(),
  season: z.string().trim().max(40).nullable().optional(),
  audience: z.enum(['kids', 'adults', 'general']).optional(),
  foodFocused: z.boolean().optional(),
  lat: z.number().gte(-90).lte(90),
  lng: z.number().gte(-180).lte(180),
})

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

/** Builds the web-search query that finds the right travel guides for this trip. */
function guideQuery(destination: string, profile: TravelerProfile): string {
  const bits = [destination, profile.season ?? '', profile.party, describeInterests(profile), 'best things to do itinerary']
  return bits.filter(Boolean).join(' ').slice(0, 200)
}

/**
 * POST /api/discover-venues
 *
 * Web-grounded venue discovery. Searches real travel guides for the traveler's
 * specific trip (party, season, interests), has the model extract the SPECIFIC
 * named places those guides recommend, then verifies each against Google Places
 * so only real, correctly-located venues survive. This is what makes a plan
 * read like a curated guide instead of a proximity dump.
 *
 * Grounding holds end to end: the model proposes names, but every returned
 * place is a verified Google Places result with real coordinates. Fails soft to
 * an empty list (the trip falls back to the nearby pool). Cached by
 * destination+profile so the search/scrape/verify cost is paid once.
 *
 * @returns `{ places: ThingToDo[], venues: string[], cached? }`, or `{ error }` (400/429/500)
 */
export async function onRequestPost({ env, request }: { env: DiscoverEnv; request: Request }): Promise<Response> {
  if (!env.OPENAI_API_KEY || !env.GOOGLE_PLACES_API_KEY) {
    return json({ error: 'discovery is not configured' }, 500)
  }

  const parsed = requestSchema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) return json({ error: 'invalid request' }, 400)

  const { destination, interests, days, party, occasion, season, audience, foodFocused, lat, lng } = parsed.data
  const maxVenues = discoveredVenuesForDays(days ?? 4)
  const profile: TravelerProfile = {
    party: party || 'travelers',
    occasion: occasion ?? undefined,
    season: season ?? undefined,
    audience: audience ?? 'general',
    interests,
    foodFocused: foodFocused ?? false,
  }

  // Cache by destination + the full profile AND the venue target, since a
  // family trip and an adults trip want different venues, and a long trip wants
  // MORE of them than a short one (maxVenues encodes the trip length).
  const cacheSeed = `discover:${PLACE_CACHE_VERSION}|${interests}|${profile.party}|${profile.audience}|${profile.season ?? ''}|n${maxVenues}`
  const cacheKey = await buildInterestCacheKey(normalizeLocationSlug(destination), cacheSeed)
  try {
    const cached = await getInterestPlacesCache(env, cacheKey)
    if (cached) {
      logger.info('discover cache hit', { cacheKey })
      return json({ places: cached.places ?? [], venues: cached.queries ?? [], cached: true }, 200)
    }
  } catch (err) {
    logger.warn('discover cache read failed; running live', { reason: err instanceof Error ? err.message : String(err) })
  }

  if (await isRateLimited(env, request, 'discover-venues', RATE_LIMIT_PER_HOUR)) {
    return json({ error: 'rate limit exceeded, try again later' }, 429)
  }

  const respond = async (places: ThingToDo[], venues: string[]): Promise<Response> => {
    try {
      await upsertInterestPlacesCache(env, { cache_key: cacheKey, places, queries: venues })
    } catch (err) {
      logger.warn('discover cache write failed', { reason: err instanceof Error ? err.message : String(err) })
    }
    return json({ places, venues }, 200)
  }

  try {
    // 1. Real travel-guide content for THIS trip (empty if search unavailable —
    //    the prompt then leans on the model's own knowledge of the place).
    const guideContent = env.BRAVE_API ? await gatherGuideContent(guideQuery(destination, profile), env.BRAVE_API) : ''

    // 2. Extract the specific named venues a guide would recommend.
    const aiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: env.AI_MODEL ?? DEFAULT_MODEL,
        messages: [{ role: 'user', content: buildDiscoverPrompt(profile, destination, guideContent, maxVenues) }],
        response_format: { type: 'json_object' },
        temperature: 0.3,
        // Scale with the venue count — too low truncates the JSON mid-array and
        // the whole response fails to parse. ~50 tokens per terse venue + slack.
        max_tokens: Math.min(2600, maxVenues * 55 + 200),
      }),
    })
    if (!aiRes.ok) {
      logger.warn('discover openai non-ok', { status: aiRes.status })
      return json({ places: [], venues: [] }, 200)
    }
    const bodyParsed = openAiResponseSchema.safeParse(await aiRes.json())
    if (!bodyParsed.success) return json({ places: [], venues: [] }, 200)

    let raw: unknown
    try {
      raw = JSON.parse(bodyParsed.data.choices[0].message.content)
    } catch {
      return json({ places: [], venues: [] }, 200)
    }
    const venues = normalizeDiscoveredVenues(raw, maxVenues)
    if (venues.length === 0) return respond([], [])

    // 3. Verify each named venue against Google Places (grounding). Unverified
    //    names are dropped, so nothing fabricated reaches the plan.
    const verified = await Promise.all(venues.map((v) => findPlaceByName(v.name, lat, lng, env.GOOGLE_PLACES_API_KEY as string)))
    const seen = new Set<string>()
    const places: ThingToDo[] = []
    for (const p of verified) {
      if (!p) continue
      if (!isRequestedExperienceCategory(p.category)) continue
      const key = p.name.trim().toLowerCase()
      if (key === '' || seen.has(key)) continue
      seen.add(key)
      places.push({ ...p, themed: true })
    }

    logger.info('discover found', { proposed: venues.length, verified: places.length })
    return respond(dropCorruptNames(places), venues.map((v) => v.name))
  } catch (err) {
    logger.error('discover failed', err)
    return json({ places: [], venues: [] }, 200)
  }
}
