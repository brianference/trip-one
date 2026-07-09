import { z } from 'zod'

type PhotoEnv = { GOOGLE_PLACES_API_KEY?: string }

// Clamp requested width so the proxy can't be used to pull huge images.
const MIN_WIDTH = 80
const MAX_WIDTH = 800
const DEFAULT_WIDTH = 400

const querySchema = z.object({
  ref: z.string().min(1).max(1000),
  w: z.coerce.number().int().min(MIN_WIDTH).max(MAX_WIDTH).optional(),
})

/**
 * GET /api/place-photo?ref=<photo_reference>&w=400
 *
 * Streams a Google Places photo through the server so the API key never
 * reaches the browser. Google's photo endpoint 302s to a googleusercontent
 * URL; `fetch` follows it, and the image bytes are returned with a long cache
 * so repeat views don't re-hit Google.
 */
export async function onRequestGet({ env, request }: { env: PhotoEnv; request: Request }): Promise<Response> {
  if (!env.GOOGLE_PLACES_API_KEY) return new Response('not configured', { status: 500 })

  const url = new URL(request.url)
  const parsed = querySchema.safeParse({
    ref: url.searchParams.get('ref') ?? '',
    w: url.searchParams.get('w') ?? undefined,
  })
  if (!parsed.success) return new Response('bad request', { status: 400 })

  const width = parsed.data.w ?? DEFAULT_WIDTH
  const photoUrl = `https://maps.googleapis.com/maps/api/place/photo?maxwidth=${width}&photo_reference=${encodeURIComponent(parsed.data.ref)}&key=${env.GOOGLE_PLACES_API_KEY}`
  const res = await fetch(photoUrl)
  if (!res.ok || !res.body) return new Response('photo unavailable', { status: 502 })

  return new Response(res.body, {
    status: 200,
    headers: {
      'Content-Type': res.headers.get('content-type') ?? 'image/jpeg',
      'Cache-Control': 'public, max-age=604800, immutable',
    },
  })
}
