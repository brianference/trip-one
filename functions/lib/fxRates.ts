import { z } from 'zod'
import type { Env } from './db'
import { logger } from '../../src/lib/logger'

/** How long a fetched rate table is served before we ask upstream again. */
export const FX_CACHE_TTL_MS = 6 * 60 * 60 * 1000
/** Keyless open endpoint; terms require the on-page credit rendered by MoneyPage. */
const FX_SOURCE_URL = 'https://open.er-api.com/v6/latest/USD'
const BASE_CURRENCY = 'USD'

const upstreamSchema = z.object({
  result: z.literal('success'),
  time_last_update_utc: z.string(),
  rates: z.record(z.number().positive()),
})

export interface UsdRates {
  rates: Record<string, number>
  updatedAt: string
  fetchedAt: number
}

/**
 * Reads the cached USD rate table from D1.
 * @param env - Function bindings
 * @returns The cached row, or null when absent or unparseable
 */
async function readCached(env: Env): Promise<UsdRates | null> {
  const row = await env.DB.prepare('SELECT rates, provider_updated, fetched_at FROM fx_rates WHERE base = ?')
    .bind(BASE_CURRENCY)
    .first<{ rates: string; provider_updated: string; fetched_at: number }>()
  if (!row) return null
  try {
    return { rates: JSON.parse(row.rates) as Record<string, number>, updatedAt: row.provider_updated, fetchedAt: row.fetched_at }
  } catch {
    return null
  }
}

/**
 * Fetches the live USD rate table from open.er-api.com.
 * @param now - Clock injection for the returned table's fetchedAt
 * @returns The parsed table, or null on any network, status or shape failure
 */
async function fetchUpstream(now: number): Promise<UsdRates | null> {
  try {
    const res = await fetch(FX_SOURCE_URL)
    if (!res.ok) {
      logger.warn('fx upstream non-ok', { status: res.status })
      return null
    }
    const parsed = upstreamSchema.safeParse(await res.json())
    if (!parsed.success) return null
    return { rates: parsed.data.rates, updatedAt: parsed.data.time_last_update_utc, fetchedAt: now }
  } catch (err) {
    logger.error('fx upstream fetch failed', err)
    return null
  }
}

/**
 * USD → every currency, cached in D1 for {@link FX_CACHE_TTL_MS}. A stale
 * cached table beats no table when upstream is down or rate-limiting us.
 * @param env - Function bindings
 * @param now - Clock injection for tests
 * @returns The rate table, or null when nothing is cached and upstream failed
 */
export async function getUsdRates(env: Env, now: number = Date.now()): Promise<UsdRates | null> {
  const cached = await readCached(env)
  if (cached && now - cached.fetchedAt < FX_CACHE_TTL_MS) return cached

  const fresh = await fetchUpstream(now)
  if (!fresh) return cached
  await env.DB.prepare(
    'INSERT INTO fx_rates (base, rates, provider_updated, fetched_at) VALUES (?, ?, ?, ?) ' +
      'ON CONFLICT(base) DO UPDATE SET rates = excluded.rates, provider_updated = excluded.provider_updated, fetched_at = excluded.fetched_at',
  )
    .bind(BASE_CURRENCY, JSON.stringify(fresh.rates), fresh.updatedAt, fresh.fetchedAt)
    .run()
  return fresh
}
