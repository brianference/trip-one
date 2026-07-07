import { describe, it, expect } from 'vitest'
import { buildStarterItinerary } from './buildStarterItinerary'
import type { ThingToDo } from '../api/client'

function thing(name: string, rating?: number, coords?: { lat: number; lng: number }): ThingToDo {
  return { name, category: 'attraction', source: 'tripadvisor', rating, ...coords }
}

describe('buildStarterItinerary', () => {
  it('maps things-to-do into unscheduled option itinerary items', () => {
    const items = buildStarterItinerary([thing('Guinness Storehouse', 4.5)])
    expect(items).toEqual([
      {
        time: '',
        text: 'Guinness Storehouse',
        type: 'option',
        q: 'Guinness Storehouse',
        category: 'attraction',
        lat: undefined,
        lng: undefined,
      },
    ])
  })

  it('carries real coordinates through for day clustering and the map route line', () => {
    const items = buildStarterItinerary([thing('Places-sourced spot', 4.5, { lat: 38.7, lng: -9.1 })])
    expect(items[0].lat).toBe(38.7)
    expect(items[0].lng).toBe(-9.1)
  })

  it('sorts by rating descending', () => {
    const items = buildStarterItinerary([thing('Low', 3.1), thing('High', 4.9), thing('Mid', 4.0)])
    expect(items.map((i) => i.text)).toEqual(['High', 'Mid', 'Low'])
  })

  it('treats missing ratings as lowest priority without crashing', () => {
    const items = buildStarterItinerary([thing('No rating'), thing('Rated', 4.2)])
    expect(items.map((i) => i.text)).toEqual(['Rated', 'No rating'])
  })

  it('caps the result at 15 items', () => {
    const many = Array.from({ length: 20 }, (_, i) => thing(`Place ${i}`, i))
    const items = buildStarterItinerary(many)
    expect(items).toHaveLength(15)
    // Highest-rated (index 19 down to 5) should be kept.
    expect(items[0].text).toBe('Place 19')
    expect(items[14].text).toBe('Place 5')
  })

  it('uses however many things-to-do are available when fewer than 15 exist', () => {
    const items = buildStarterItinerary([thing('Only one', 5)])
    expect(items).toHaveLength(1)
  })

  it('returns an empty array when there are no things to do', () => {
    expect(buildStarterItinerary([])).toEqual([])
  })
})
