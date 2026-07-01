import { describe, it, expect, vi, afterEach } from 'vitest'
import { geocode } from './geocode'

describe('geocode', () => {
  afterEach(() => vi.restoreAllMocks())

  it('returns lat/lng/displayName for the first result', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [{ lat: '53.3498', lon: '-6.2603', display_name: 'Dublin, Ireland' }],
      }),
    )
    const result = await geocode('Dublin, Ireland')
    expect(result).toEqual({ lat: 53.3498, lng: -6.2603, displayName: 'Dublin, Ireland' })
  })

  it('returns null when nothing is found', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => [] }))
    expect(await geocode('asdfghjkl')).toBeNull()
  })
})
