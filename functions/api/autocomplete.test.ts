import { describe, it, expect, vi, afterEach } from 'vitest'
import { onRequestGet } from './autocomplete'
import { logger } from '../../src/lib/logger'

function req(url: string) {
  return new Request(url)
}

describe('GET /api/autocomplete', () => {
  afterEach(() => vi.restoreAllMocks())

  it('returns 400 for a missing query', async () => {
    const res = await onRequestGet({ request: req('https://x/api/autocomplete') } as never)
    expect(res.status).toBe(400)
  })

  it('returns 400 for a too-short query', async () => {
    const res = await onRequestGet({ request: req('https://x/api/autocomplete?q=d') } as never)
    expect(res.status).toBe(400)
  })

  it('returns mapped suggestions for a valid query', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        { lat: '53.3498', lon: '-6.2603', display_name: 'Dublin, Ireland' },
        { lat: '53.3441', lon: '-6.2675', display_name: 'Dublin, County Dublin, Ireland' },
        { lat: '40.0992', lon: '-83.1141', display_name: 'Dublin, Ohio, USA' },
      ],
    })
    vi.stubGlobal('fetch', fetchMock)
    const res = await onRequestGet({ request: req('https://x/api/autocomplete?q=dublin') } as never)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.suggestions).toEqual([
      { displayName: 'Dublin, Ireland', lat: 53.3498, lng: -6.2603 },
      { displayName: 'Dublin, County Dublin, Ireland', lat: 53.3441, lng: -6.2675 },
      { displayName: 'Dublin, Ohio, USA', lat: 40.0992, lng: -83.1141 },
    ])
    const calledUrl = String(fetchMock.mock.calls[0][0])
    expect(calledUrl).toContain('nominatim.openstreetmap.org/search')
    expect(calledUrl).toContain('q=dublin')
    expect(calledUrl).toContain('limit=5')
    expect(calledUrl).toContain('addressdetails=1')
    const calledOpts = fetchMock.mock.calls[0][1]
    expect(calledOpts.headers['User-Agent']).toBeDefined()
  })

  it('returns an empty suggestions array (not a 500) when the upstream call fails', async () => {
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {})
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('network down')),
    )
    const res = await onRequestGet({ request: req('https://x/api/autocomplete?q=dublin') } as never)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.suggestions).toEqual([])
    expect(errorSpy).toHaveBeenCalled()
  })

  it('returns an empty suggestions array when the upstream responds non-ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503, json: async () => ({}) }))
    const res = await onRequestGet({ request: req('https://x/api/autocomplete?q=dublin') } as never)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.suggestions).toEqual([])
  })
})
