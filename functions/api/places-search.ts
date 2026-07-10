import { z } from 'zod'
import type { Env } from '../lib/supabaseAdmin'
import { textSearchPlaces } from '../lib/places'
import { isRateLimited } from '../lib/rateLimitGuard'
import { logger } from '../../src/lib/logger'

type PlacesSearchEnv = Env & { GOOGLE_PLACES_API_KEY?: string }

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
  if (!env.GOOGLE_PLACES_API_KEY) return json({ error: 'place search not configured' }, 500)

  const url = new URL(request.url)
  const parsed = querySchema.safeParse({ q: url.searchParams.get('q') ?? '', lat: url.searchParams.get('lat'), lng: url.searchParams.get('lng') })
  if (!parsed.success) return json({ error: 'invalid query' }, 400)

  if (await isRateLimited(env, request, 'places-search', PLACES_SEARCH_PER_HOUR)) {
    return json({ error: 'rate limit exceeded, try again later' }, 429)
  }

  try {
    const places = await textSearchPlaces(parsed.data.q, parsed.data.lat, parsed.data.lng, env.GOOGLE_PLACES_API_KEY)
    return json({ places }, 200)
  } catch (err) {
    logger.error('places search failed', err)
    return json({ error: 'internal error' }, 500)
  }
}
