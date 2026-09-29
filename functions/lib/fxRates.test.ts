import { describe, it, expect, vi, afterEach } from 'vitest'
import { fakeD1 } from './testD1'
import { getUsdRates, FX_CACHE_TTL_MS } from './fxRates'

const NOW = 1_800_000_000_000
const UPSTREAM = {
  result: 'success',
  time_last_update_utc: 'Tue, 29 Sep 2026 00:02:31 +0000',
  rates: { USD: 1, EUR: 0.9, VND: 25000, MAD: 9.9 },
}

afterEach(() => vi.unstubAllGlobals())

describe('getUsdRates', () => {
  it('serves a fresh cached row without calling upstream', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const { env } = fakeD1({ first: () => ({ rates: JSON.stringify({ EUR: 0.9 }), provider_updated: 'x', fetched_at: NOW - 1000 }) })
    const out = await getUsdRates(env, NOW)
    expect(out?.rates.EUR).toBe(0.9)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('refetches when the cached row is older than the TTL and stores it', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(UPSTREAM))))
    const { env, calls } = fakeD1({ first: () => ({ rates: '{}', provider_updated: 'x', fetched_at: NOW - FX_CACHE_TTL_MS - 1 }) })
    const out = await getUsdRates(env, NOW)
    expect(out?.rates.VND).toBe(25000)
    expect(calls.some((c) => /insert into fx_rates/i.test(c.sql))).toBe(true)
  })

  it('falls back to a stale row when upstream fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 429 })))
    const { env } = fakeD1({ first: () => ({ rates: JSON.stringify({ EUR: 0.8 }), provider_updated: 'x', fetched_at: 0 }) })
    expect((await getUsdRates(env, NOW))?.rates.EUR).toBe(0.8)
  })

  it('returns null when upstream fails and nothing is cached', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')))
    const { env } = fakeD1({ first: () => null })
    expect(await getUsdRates(env, NOW)).toBeNull()
  })

  it('rejects an upstream body whose result is not success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ result: 'error' }))))
    const { env } = fakeD1({ first: () => null })
    expect(await getUsdRates(env, NOW)).toBeNull()
  })
})
