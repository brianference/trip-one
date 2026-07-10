import { z } from 'zod'
import { isRateLimited } from '../lib/rateLimitGuard'
import type { Env } from '../lib/supabaseAdmin'
import { logger } from '../../src/lib/logger'

const currencyQuerySchema = z.string().trim().regex(/^[A-Z]{3}$/)
const CURRENCY_PER_HOUR = 1200

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

/**
 * GET /api/currency?to=<ISO 4217 code>
 *
 * Proxies the current USD exchange rate from the free Frankfurter API
 * (api.frankfurter.dev) so the browser never calls it directly — Frankfurter
 * sends no Access-Control-Allow-Origin header, so a direct client-side fetch
 * is blocked by CORS regardless of this app's own CSP.
 * @param context - Request context with `request`
 * @returns JSON response: `{ rate }` on success (rate is null if Frankfurter
 * doesn't recognize the currency), or `{ error }` with 400 for an invalid query
 */
export async function onRequestGet({ env, request }: { env: Env; request: Request }): Promise<Response> {
  const to = new URL(request.url).searchParams.get('to') ?? ''
  const parsed = currencyQuerySchema.safeParse(to)
  if (!parsed.success) return json({ error: 'invalid currency code' }, 400)

  if (await isRateLimited(env, request, 'currency', CURRENCY_PER_HOUR)) {
    return json({ rate: null }, 200)
  }

  try {
    const res = await fetch(`https://api.frankfurter.dev/v1/latest?from=USD&to=${parsed.data}`)
    if (!res.ok) {
      logger.warn('frankfurter non-ok response', { status: res.status })
      return json({ rate: null }, 200)
    }
    const body = (await res.json()) as { rates?: Record<string, number> }
    return json({ rate: body.rates?.[parsed.data] ?? null }, 200)
  } catch (err) {
    logger.error('currency rate lookup failed', err)
    return json({ rate: null }, 200)
  }
}
