import { describe, it, expect, vi, afterEach } from 'vitest'
import { onRequestGet } from './currency'
import { fakeD1 } from '../lib/testD1'
import { logger } from '../../src/lib/logger'

function req(url: string) {
  return new Request(url)
}

describe('GET /api/currency', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('returns 400 for a missing currency code', async () => {
    const { env } = fakeD1()
    const res = await onRequestGet({ env, request: req('https://x/api/currency') } as never)
    expect(res.status).toBe(400)
  })

  it('returns 400 for a malformed currency code', async () => {
    const { env } = fakeD1()
    const res = await onRequestGet({ env, request: req('https://x/api/currency?to=eur') } as never)
    expect(res.status).toBe(400)
  })

  it('returns the cached VND rate, proving a formerly unsupported code now works', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const { env } = fakeD1({
      first: () => ({
        rates: JSON.stringify({ VND: 25000 }),
        provider_updated: 'Tue, 29 Sep 2026 00:02:31 +0000',
        fetched_at: Date.now(),
      }),
    })
    const res = await onRequestGet({ env, request: req('https://x/api/currency?to=VND') } as never)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.rate).toBe(25000)
    expect(body.updatedAt).toBe('Tue, 29 Sep 2026 00:02:31 +0000')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('returns a null rate and updatedAt when upstream fails and nothing is cached', async () => {
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {})
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')))
    const { env } = fakeD1({ first: () => null })
    const res = await onRequestGet({ env, request: req('https://x/api/currency?to=EUR') } as never)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.rate).toBeNull()
    expect(body.updatedAt).toBeNull()
    expect(errorSpy).toHaveBeenCalled()
  })
})
