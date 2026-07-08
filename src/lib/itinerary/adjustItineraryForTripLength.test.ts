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
    expect(result).toBe(items)
  })
})
