import { describe, it, expect } from 'vitest'
import { ensureStopIds, carryOverStopIds } from './stopIds'
import { organizeItinerary } from './organizeItinerary'
import { dedupeItinerary } from './dedupeItinerary'
import { reorderItinerary } from './reorderItinerary'
import type { ItineraryItem } from '../validation/schemas'

const stop = (text: string, day = 1): ItineraryItem => ({ time: '', text, type: 'option', day, lat: 1, lng: 1 })
const withId = (text: string, id: string, day = 1): ItineraryItem => ({ ...stop(text, day), id })

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

describe('carryOverStopIds', () => {
  it('keeps the id when a re-mentioned day carries the same place', () => {
    const previous = [withId('Ueno Park', '11111111-1111-4111-8111-111111111111', 2)]
    const next = [stop('Ueno Park', 2)]
    const out = carryOverStopIds(previous, next)
    expect(out[0].id).toBe('11111111-1111-4111-8111-111111111111')
  })

  it('gives a new place no carried id (ensureStopIds assigns one downstream)', () => {
    const previous = [withId('Ueno Park', '11111111-1111-4111-8111-111111111111', 2)]
    const next = [stop('Senso-ji', 2)]
    const out = carryOverStopIds(previous, next)
    expect(out[0].id).toBeUndefined()
  })

  it('claims each existing id at most once, so two same-name planned items cannot both inherit it', () => {
    const previous = [withId('Ueno Park', '11111111-1111-4111-8111-111111111111', 2)]
    const next = [stop('Ueno Park', 2), stop('Ueno Park', 2)]
    const out = carryOverStopIds(previous, next)
    expect(out[0].id).toBe('11111111-1111-4111-8111-111111111111')
    expect(out[1].id).toBeUndefined()
  })

  it('matches by placeId even when the text differs', () => {
    const previous = [
      { ...withId('Ueno Park (old name)', '11111111-1111-4111-8111-111111111111', 2), placeId: 'ChIJ-place-1' },
    ]
    const next = [{ ...stop('Ueno Park', 2), placeId: 'ChIJ-place-1' }]
    const out = carryOverStopIds(previous, next)
    expect(out[0].id).toBe('11111111-1111-4111-8111-111111111111')
  })
})
