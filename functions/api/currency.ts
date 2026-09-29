import { z } from 'zod'
import { isRateLimited } from '../lib/rateLimitGuard'
import { getUsdRates } from '../lib/fxRates'
import type { Env } from '../lib/db'
import { logger } from '../../src/lib/logger'

const currencyQuerySchema = z.string().trim().regex(/^[A-Z]{3}$/)
const CURRENCY_PER_HOUR = 1200

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

/**
 * GET /api/currency?to=<ISO 4217 code>
 *
 * Serves the current USD exchange rate from the D1-cached table in
 * {@link getUsdRates}, which itself is backed by the free open.er-api.com
 * endpoint. The browser never calls that endpoint directly, and the D1 cache
 * means most requests never make an upstream call at all.
 * @param context - Request context with `env` and `request`
 * @returns JSON response: `{ rate, updatedAt }` on success (`rate` is null if
 * the code isn't in the table, `updatedAt` is the provider's last-update time),
 * or `{ error }` with 400 for an invalid query
 */
export async function onRequestGet({ env, request }: { env: Env; request: Request }): Promise<Response> {
  const to = new URL(request.url).searchParams.get('to') ?? ''
  const parsed = currencyQuerySchema.safeParse(to)
  if (!parsed.success) return json({ error: 'That currency code isn’t one we recognise.' }, 400)

  if (await isRateLimited(env, request, 'currency', CURRENCY_PER_HOUR)) {
    return json({ rate: null, updatedAt: null }, 200)
  }

  try {
    const table = await getUsdRates(env)
    return json({ rate: table?.rates[parsed.data] ?? null, updatedAt: table?.updatedAt ?? null }, 200)
  } catch (err) {
    logger.error('currency rate lookup failed', err)
    return json({ rate: null, updatedAt: null }, 200)
  }
}
