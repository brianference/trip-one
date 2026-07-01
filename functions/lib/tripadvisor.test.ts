import { describe, it, expect, vi, afterEach } from 'vitest'
import { searchThingsToDo } from './tripadvisor'

describe('tripadvisor searchThingsToDo', () => {
  afterEach(() => vi.restoreAllMocks())

  it('maps results into the shared ThingToDo shape', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [{ name: 'Trinity College', category: { name: 'attraction' }, rating: '4.6' }],
        }),
      }),
    )
    const results = await searchThingsToDo('dublin-ireland', 53.35, -6.26, 'test-key')
    expect(results).toEqual([
      { name: 'Trinity College', category: 'attraction', source: 'tripadvisor', rating: 4.6 },
    ])
  })

  it('returns an empty array on a non-ok response instead of throwing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }))
    expect(await searchThingsToDo('x', 0, 0, 'k')).toEqual([])
  })
})
