import { autocompleteQuerySchema } from '../../src/lib/validation/schemas'
import { autocompleteSearch } from '../lib/geocode'
import { logger } from '../../src/lib/logger'

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

/**
 * GET /api/autocomplete?q=<partial query>
 *
 * Proxies partial-text location suggestions from Nominatim (OpenStreetMap) so the
 * browser never calls Nominatim directly (their usage policy discourages client-side
 * calls and requires a `User-Agent` header). Always fails soft: any upstream error
 * yields an empty suggestions list rather than a 500, since the "Go" button flow
 * through `/api/location` still works without autocomplete.
 * @param context - Request context with `request`
 * @returns JSON response: `{ suggestions: [{ displayName, lat, lng }] }` on success
 * (empty array on any upstream failure), or `{ error }` with 400 for an invalid query
 */
export async function onRequestGet({ request }: { request: Request }): Promise<Response> {
  const q = new URL(request.url).searchParams.get('q') ?? ''
  const parsed = autocompleteQuerySchema.safeParse(q)
  if (!parsed.success) return json({ error: 'invalid query' }, 400)

  try {
    const results = await autocompleteSearch(parsed.data)
    return json({ suggestions: results }, 200)
  } catch (err) {
    logger.error('autocomplete lookup failed', err)
    return json({ suggestions: [] }, 200)
  }
}
