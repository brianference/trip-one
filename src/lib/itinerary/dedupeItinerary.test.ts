import { describe, it, expect } from 'vitest'
import { dedupeItinerary, dedupePlaceSuggestions, normalizeStopName } from './dedupeItinerary'
import type { ItineraryItem } from '../validation/schemas'

function stop(text: string, extras: Partial<ItineraryItem> & { placeId?: string } = {}): ItineraryItem {
  return { time: extras.time ?? '', text, type: extras.type ?? 'option', day: extras.day, ...extras }
}

describe('normalizeStopName', () => {
  it('trims and lowercases', () => {
    expect(normalizeStopName('  Odaiba Beach  ')).toBe('odaiba beach')
  })
})

describe('dedupeItinerary', () => {
  it('removes exact normalized-name duplicates and keeps the first day/time', () => {
    // Mirrors the live Tokyo demo drift: same names landing twice with
    // different day assignments. First occurrence (and its day/time) wins.
    const items: ItineraryItem[] = [
      stop('Odaiba Beach', { time: '10:00', day: 2 }),
      stop('Odaiba Marine Park', { time: '11:00', day: 2 }),
      stop('Isshiki Beach', { time: '14:00', day: 3 }),
      stop('Odaiba Beach', { time: '09:00', day: 5 }),
      stop('Odaiba Marine Park', { time: '15:00', day: 5 }),
      stop('Isshiki Beach', { time: '16:00', day: 6 }),
    ]
    const result = dedupeItinerary(items)
    expect(result).toHaveLength(3)
    expect(result.map((i) => i.text)).toEqual(['Odaiba Beach', 'Odaiba Marine Park', 'Isshiki Beach'])
    expect(result[0]).toMatchObject({ time: '10:00', day: 2 })
    expect(result[1]).toMatchObject({ time: '11:00', day: 2 })
    expect(result[2]).toMatchObject({ time: '14:00', day: 3 })
  })

  it('treats trim/case variants as the same place', () => {
    const result = dedupeItinerary([
      stop('Shibuya Crossing', { day: 1, time: '09:00' }),
      stop('  shibuya crossing ', { day: 3, time: '18:00' }),
    ])
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ text: 'Shibuya Crossing', day: 1, time: '09:00' })
  })

  it('treats matching placeId as the same place even when names differ', () => {
    // placeId is optional identity carried on some rows; not on the zod schema.
    const a = { ...stop('Odaiba Beach', { day: 1, time: '10:00' }), placeId: 'ChIJ-odaiba' }
    const b = { ...stop('Odaiba Seaside Park', { day: 4, time: '12:00' }), placeId: 'ChIJ-odaiba' }
    const result = dedupeItinerary([a, b] as ItineraryItem[])
    expect(result).toHaveLength(1)
    expect(result[0].text).toBe('Odaiba Beach')
    expect(result[0].day).toBe(1)
  })

  it('returns a new array and leaves a unique list unchanged in content', () => {
    const items = [stop('A', { day: 1 }), stop('B', { day: 2 })]
    const result = dedupeItinerary(items)
    expect(result).toEqual(items)
    expect(result).not.toBe(items)
  })

  it('returns an empty array for empty input', () => {
    expect(dedupeItinerary([])).toEqual([])
  })
})

describe('dedupePlaceSuggestions', () => {
  it('drops later candidates with the same normalized name', () => {
    const places = [
      { name: 'Odaiba Beach', placeId: 'a' },
      { name: 'Odaiba Beach', placeId: 'b' },
      { name: 'Meiji Jingu' },
    ]
    expect(dedupePlaceSuggestions(places).map((p) => p.name)).toEqual(['Odaiba Beach', 'Meiji Jingu'])
  })

  it('drops later candidates with the same placeId', () => {
    const places = [
      { name: 'First label', placeId: 'ChIJ1' },
      { name: 'Second label', placeId: 'ChIJ1' },
    ]
    expect(dedupePlaceSuggestions(places)).toHaveLength(1)
    expect(dedupePlaceSuggestions(places)[0].name).toBe('First label')
  })
})
