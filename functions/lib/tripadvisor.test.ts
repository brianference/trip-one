import { describe, it, expect, vi, afterEach } from 'vitest'
import { searchThingsToDo, textSearchThingsToDo } from './tripadvisor'

describe('tripadvisor searchThingsToDo', () => {
  afterEach(() => vi.restoreAllMocks())

  it('maps results into the shared ThingToDo shape', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [{ name: 'Trinity College' }],
        }),
      }),
    )
    const results = await searchThingsToDo('dublin-ireland', 53.35, -6.26, 'test-key')
    expect(results).toEqual([
      { name: 'Trinity College', category: 'attraction', source: 'tripadvisor', rating: undefined },
    ])
  })

  it('returns an empty array on a non-ok response instead of throwing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }))
    expect(await searchThingsToDo('x', 0, 0, 'k')).toEqual([])
  })
})

describe('tripadvisor textSearchThingsToDo', () => {
  afterEach(() => vi.restoreAllMocks())

  it('searches by text then enriches the top hits with coordinates and rating', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (String(url).includes('/location/search')) {
          return Promise.resolve({ ok: true, json: async () => ({ data: [{ location_id: '42', name: 'Space Expo' }] }) })
        }
        if (String(url).includes('/location/42/details')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ latitude: '52.2428', longitude: '4.4774', rating: '4.1', category: { name: 'museum' } }),
          })
        }
        throw new Error(`unexpected fetch to ${url}`)
      }),
    )
    const results = await textSearchThingsToDo('space museum', 52.13, 5.29, 'k')
    expect(results).toEqual([
      { name: 'Space Expo', category: 'museum', source: 'tripadvisor', rating: 4.1, lat: 52.2428, lng: 4.4774 },
    ])
  })

  it('returns an empty array when the search response is not ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }))
    expect(await textSearchThingsToDo('space', 0, 0, 'k')).toEqual([])
  })
})
