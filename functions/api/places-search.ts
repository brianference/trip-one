import { z } from 'zod'
import type { Env } from '../lib/db'
import { textSearchPlaces } from '../lib/places'
import { textSearchThingsToDo } from '../lib/tripadvisor'
import { isRateLimited } from '../lib/rateLimitGuard'
import { logger } from '../../src/lib/logger'

type PlacesSearchEnv = Env & { GOOGLE_PLACES_API_KEY?: string; TRIPADVISOR_API_KEY?: string }

// Below this many Google hits, also pull Tripadvisor so niche/thematic queries
// ("space museum", "planetarium") that Google misses still surface real results.
const GOOGLE_ENOUGH = 5

// Paid Google call; gated per IP like the other Places-backed endpoints.
const PLACES_SEARCH_PER_HOUR = 600

const querySchema = z.object({
  q: z.string().trim().min(1).max(120),
  lat: z.coerce.number().gte(-90).lte(90),
  lng: z.coerce.number().gte(-180).lte(180),
})

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

/**
 * GET /api/places-search?q=<kind of place>&lat=<lat>&lng=<lng>
 *
 * Free-text Google Places search near a coordinate, so the chat can add any
 * kind of place ("sushi", "rooftop bar", "vegan cafe") the fixed nearby pool
 * doesn't already cover. Every result is a real, correctly-typed place — never
 * fabricated. Fails soft to an empty list.
 * @returns `{ places: ThingToDo[] }` on success, or `{ error }` (400/429/500)
 */
export async function onRequestGet({ env, request }: { env: PlacesSearchEnv; request: Request }): Promise<Response> {
  if (!env.GOOGLE_PLACES_API_KEY) return json({ error: 'Place search is temporarily unavailable. Please try again later.' }, 500)

  const url = new URL(request.url)
  const parsed = querySchema.safeParse({ q: url.searchParams.get('q') ?? '', lat: url.searchParams.get('lat'), lng: url.searchParams.get('lng') })
  if (!parsed.success) return json({ error: 'That search didn’t look right. Try a different wording.' }, 400)

  if (await isRateLimited(env, request, 'places-search', PLACES_SEARCH_PER_HOUR)) {
    return json({ error: 'You’ve made a lot of requests in a short time. Please wait a few minutes and try again.' }, 429)
  }

  try {
    const { q, lat, lng } = parsed.data
    const places = await textSearchPlaces(q, lat, lng, env.GOOGLE_PLACES_API_KEY)

    // Fall back to (or supplement with) Tripadvisor for thematic/niche queries
    // Google returns little for, deduping by name.
    if (places.length < GOOGLE_ENOUGH && env.TRIPADVISOR_API_KEY) {
      const fromTa = await textSearchThingsToDo(q, lat, lng, env.TRIPADVISOR_API_KEY)
      const seen = new Set(places.map((p) => p.name.toLowerCase()))
      for (const p of fromTa) {
        if (seen.has(p.name.toLowerCase())) continue
        seen.add(p.name.toLowerCase())
        places.push(p)
      }
    }

    return json({ places }, 200)
  } catch (err) {
    logger.error('places search failed', err)
    return json({ error: 'Something went wrong on our end. Please try again in a moment.' }, 500)
  }
}
