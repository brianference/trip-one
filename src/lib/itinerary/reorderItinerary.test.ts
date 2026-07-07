import { describe, it, expect } from 'vitest'
import { reorderItinerary } from './reorderItinerary'
import type { ItineraryItem } from '../validation/schemas'

function item(text: string, day: number): ItineraryItem {
  return { time: '', text, type: 'option', day }
}

describe('reorderItinerary', () => {
  it('swaps two adjacent items when moved forward by one (move-down button)', () => {
    const items = [item('A', 1), item('B', 1)]
    const result = reorderItinerary(items, 0, 1, 1)
    expect(result.map((i) => i.text)).toEqual(['B', 'A'])
  })

  it('swaps two adjacent items when moved backward by one (move-up button)', () => {
    const items = [item('A', 1), item('B', 1)]
    const result = reorderItinerary(items, 1, 0, 1)
    expect(result.map((i) => i.text)).toEqual(['B', 'A'])
  })

  it('moves an item to occupy a given final index further along the array', () => {
    const items = [item('A', 1), item('B', 1), item('C', 1)]
    const result = reorderItinerary(items, 0, 2, 1)
    expect(result.map((i) => i.text)).toEqual(['B', 'C', 'A'])
  })

  it('reassigns the moved item to the target day', () => {
    const items = [item('A', 1), item('B', 2)]
    const result = reorderItinerary(items, 0, 1, 2)
    expect(result.find((i) => i.text === 'A')?.day).toBe(2)
  })

  it('returns the same array unchanged when the indices are equal', () => {
    const items = [item('A', 1), item('B', 1)]
    const result = reorderItinerary(items, 0, 0, 1)
    expect(result).toBe(items)
  })

  it('does not mutate items other than the one being moved', () => {
    const items = [item('A', 1), item('B', 1), item('C', 1)]
    const result = reorderItinerary(items, 0, 1, 1)
    expect(result[2]).toBe(items[2])
  })

  it('moves a same-day item past the next same-day item even when another day is interleaved between them', () => {
    // Mirrors the real move-up/move-down button call: entries[].index values
    // come from the full flat array, so same-day neighbors are not always
    // flat-adjacent once another day's stops sit between them.
    const items = [item('A', 1), item('X', 2), item('C', 1)]
    const movedDown = reorderItinerary(items, 0, 2, 1)
    expect(movedDown.filter((i) => i.day === 1).map((i) => i.text)).toEqual(['C', 'A'])

    const movedUp = reorderItinerary(items, 2, 0, 1)
    expect(movedUp.filter((i) => i.day === 1).map((i) => i.text)).toEqual(['C', 'A'])
  })
})
