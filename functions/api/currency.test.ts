import { describe, it, expect, vi, afterEach } from 'vitest'
import { onRequestGet } from './currency'
import { logger } from '../../src/lib/logger'

function req(url: string) {
  return new Request(url)
}

describe('GET /api/currency', () => {
  afterEach(() => vi.restoreAllMocks())

  it('returns 400 for a missing currency code', async () => {
    const res = await onRequestGet({ request: req('https://x/api/currency') } as never)
    expect(res.status).toBe(400)
  })

  it('returns 400 for a malformed currency code', async () => {
    const res = await onRequestGet({ request: req('https://x/api/currency?to=eur') } as never)
    expect(res.status).toBe(400)
  })

  it('returns the rate for a valid currency', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ rates: { EUR: 0.92 } }) })
    vi.stubGlobal('fetch', fetchMock)
    const res = await onRequestGet({ request: req('https://x/api/currency?to=EUR') } as never)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.rate).toBe(0.92)
    expect(fetchMock).toHaveBeenCalledWith('https://api.frankfurter.dev/v1/latest?from=USD&to=EUR')
  })

  it('returns a null rate (not an error) when the upstream call fails', async () => {
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {})
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')))
    const res = await onRequestGet({ request: req('https://x/api/currency?to=EUR') } as never)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.rate).toBeNull()
    expect(errorSpy).toHaveBeenCalled()
  })

  it('returns a null rate when the upstream responds non-ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }))
    const res = await onRequestGet({ request: req('https://x/api/currency?to=EUR') } as never)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.rate).toBeNull()
  })
})
