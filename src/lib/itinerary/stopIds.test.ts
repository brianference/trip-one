import { describe, it, expect } from 'vitest'
import { ensureStopIds } from './stopIds'
import { organizeItinerary } from './organizeItinerary'
import { dedupeItinerary } from './dedupeItinerary'
import { reorderItinerary } from './reorderItinerary'
import type { ItineraryItem } from '../validation/schemas'

const stop = (text: string, day = 1): ItineraryItem => ({ time: '', text, type: 'option', day, lat: 1, lng: 1 })

describe('ensureStopIds', () => {
  it('adds a uuid to items without one and keeps existing ids', () => {
    const out = ensureStopIds([stop('A'), { ...stop('B'), id: '11111111-1111-4111-8111-111111111111' }])
    expect(out[0].id).toMatch(/^[0-9a-f-]{36}$/)
    expect(out[1].id).toBe('11111111-1111-4111-8111-111111111111')
  })

  it('returns the same reference when every item already has an id', () => {
    const items = ensureStopIds([stop('A')])
    expect(ensureStopIds(items)).toBe(items)
  })

  it('ids survive organize, dedupe and reorder', () => {
    const items = ensureStopIds([stop('A', 1), stop('B', 2), stop('C', 1)])
    const ids = new Set(items.map((i) => i.id))
    // reorderItinerary's real signature is (items, fromIndex, toIndex, targetDay).
    const results = [
      organizeItinerary(items, 2),
      dedupeItinerary(items),
      reorderItinerary(items, 0, 2, items[0].day ?? 1),
    ]
    for (const out of results) {
      expect(new Set(out.map((i) => i.id))).toEqual(ids)
    }
  })
})
