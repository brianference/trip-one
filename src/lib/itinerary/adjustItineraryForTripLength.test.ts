import { describe, it, expect } from 'vitest'
import { adjustItineraryForTripLength } from './adjustItineraryForTripLength'
import type { ItineraryItem } from '../validation/schemas'
import type { ThingToDo } from '../api/client'

function item(text: string): ItineraryItem {
  return { time: '', text, type: 'option' }
}

function thing(name: string, rating?: number): ThingToDo {
  return { name, category: 'attraction', source: 'places', rating, lat: 1, lng: 2 }
}

describe('adjustItineraryForTripLength', () => {
  it('does nothing when trip length is cleared', () => {
    const items = [item('A')]
    expect(adjustItineraryForTripLength(items, null, [thing('B')])).toBe(items)
  })

  it('adds real suggestions, highest-rated first, to reach the target pace', () => {
    const items = [item('A')]
    const result = adjustItineraryForTripLength(items, 1, [thing('Low', 3), thing('High', 4.8), thing('Mid', 4)])
    // target for 1 day = 4 items; started with 1, needs 3 more
    expect(result).toHaveLength(4)
    expect(result.slice(1).map((i) => i.text)).toEqual(['High', 'Mid', 'Low'])
  })

  it('never adds a suggestion already present in the itinerary', () => {
    const items = [item('Already here')]
    const result = adjustItineraryForTripLength(items, 1, [thing('Already here', 5), thing('New one', 4)])
    expect(result.filter((i) => i.text === 'Already here')).toHaveLength(1)
    expect(result.map((i) => i.text)).toContain('New one')
  })

  it('falls short of the target rather than fabricating a stop when real suggestions run out', () => {
    const items = [item('A')]
    const result = adjustItineraryForTripLength(items, 3, [thing('B')])
    // target for 3 days = 12; only 1 real candidate available
    expect(result).toHaveLength(2)
  })

  it('trims from the end when shrinking the trip length', () => {
    const items = ['A', 'B', 'C', 'D', 'E', 'F'].map(item)
    const result = adjustItineraryForTripLength(items, 1, [])
    // target for 1 day = 4
    expect(result.map((i) => i.text)).toEqual(['A', 'B', 'C', 'D'])
  })

  it('leaves the itinerary unchanged when already at the target pace', () => {
    const items = ['A', 'B', 'C', 'D'].map(item)
    const result = adjustItineraryForTripLength(items, 1, [thing('Would not be added')])
    expect(result.map((i) => i.text)).toEqual(['A', 'B', 'C', 'D'])
  })

  it('cannot introduce a duplicate even when the candidate list contains one twice', () => {
    // Growth once selected both copies of a repeated candidate (Tokyo demo
    // drift: Odaiba Beach / Odaiba Marine Park / Isshiki Beach pairs).
    const items = [item('Already unique')]
    const result = adjustItineraryForTripLength(items, 1, [
      thing('Odaiba Beach', 4.9),
      thing('Odaiba Beach', 4.9),
      thing('Meiji Jingu', 4.7),
      thing('Shibuya Crossing', 4.6),
    ])
    const names = result.map((i) => i.text)
    expect(names.filter((n) => n === 'Odaiba Beach')).toHaveLength(1)
    expect(new Set(names.map((n) => n.trim().toLowerCase())).size).toBe(names.length)
  })

  it('dedupes existing items before growing so a legacy pair is not kept', () => {
    const items = [item('Odaiba Beach'), item('Odaiba Beach'), item('Other')]
    const result = adjustItineraryForTripLength(items, 1, [thing('Fresh stop', 5)])
    expect(result.filter((i) => i.text === 'Odaiba Beach')).toHaveLength(1)
  })
})
