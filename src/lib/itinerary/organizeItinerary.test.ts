import { describe, it, expect } from 'vitest'
import { organizeItinerary, isFoodCategory } from './organizeItinerary'
import type { ItineraryItem } from '../validation/schemas'

function item(text: string, extra: Partial<ItineraryItem> = {}): ItineraryItem {
  return { time: '', text, type: 'option', ...extra }
}

describe('isFoodCategory', () => {
  it('recognizes restaurant/cafe/food categories', () => {
    expect(isFoodCategory('restaurant')).toBe(true)
    expect(isFoodCategory('cafe')).toBe(true)
    expect(isFoodCategory('food')).toBe(true)
  })

  it('does not treat a generic attraction as food', () => {
    expect(isFoodCategory('tourist_attraction')).toBe(false)
    expect(isFoodCategory(undefined)).toBe(false)
  })
})

describe('organizeItinerary', () => {
  it('assigns everything to day 1 when tripLengthDays is null', () => {
    const items = [item('A'), item('B'), item('C')]
    const result = organizeItinerary(items, null)
    expect(result.every((i) => i.day === 1)).toBe(true)
    expect(result).toHaveLength(3)
  })

  it('orders a single day with one meal as lunch, sandwiched between activities', () => {
    const items = [
      item('Museum', { category: 'tourist_attraction' }),
      item('Bistro', { category: 'restaurant' }),
      item('Park', { category: 'tourist_attraction' }),
      item('Gallery', { category: 'tourist_attraction' }),
    ]
    const result = organizeItinerary(items, 1)
    const texts = result.map((i) => i.text)
    // The single food item should not be first or last if there are activities on both sides.
    expect(texts.indexOf('Bistro')).toBeGreaterThan(0)
    expect(texts.indexOf('Bistro')).toBeLessThan(texts.length - 1)
    expect(result).toHaveLength(4)
  })

  it('never duplicates an item when exactly 2 meal stops exist in a day', () => {
    const items = [
      item('Cafe A', { category: 'cafe' }),
      item('Museum', { category: 'tourist_attraction' }),
      item('Restaurant B', { category: 'restaurant' }),
    ]
    const result = organizeItinerary(items, 1)
    expect(result).toHaveLength(3)
    const uniqueTexts = new Set(result.map((i) => i.text))
    expect(uniqueTexts.size).toBe(3)
  })

  it('never duplicates an item with 3+ meal stops (breakfast/lunch/dinner) plus extras', () => {
    const items = [
      item('Cafe A', { category: 'cafe' }),
      item('Restaurant B', { category: 'restaurant' }),
      item('Restaurant C', { category: 'restaurant' }),
      item('Restaurant D', { category: 'restaurant' }),
      item('Museum', { category: 'tourist_attraction' }),
    ]
    const result = organizeItinerary(items, 1)
    expect(result).toHaveLength(5)
    expect(new Set(result.map((i) => i.text)).size).toBe(5)
  })

  it('clusters items with real coordinates into the requested number of days by geography', () => {
    const items = [
      item('North A', { lat: 40.0, lng: -73.9 }),
      item('North B', { lat: 40.1, lng: -73.9 }),
      item('South A', { lat: 10.0, lng: -73.9 }),
      item('South B', { lat: 10.1, lng: -73.9 }),
    ]
    const result = organizeItinerary(items, 2)
    const dayOfSouthA = result.find((i) => i.text === 'South A')?.day
    const dayOfSouthB = result.find((i) => i.text === 'South B')?.day
    const dayOfNorthA = result.find((i) => i.text === 'North A')?.day
    const dayOfNorthB = result.find((i) => i.text === 'North B')?.day
    expect(dayOfSouthA).toBe(dayOfSouthB)
    expect(dayOfNorthA).toBe(dayOfNorthB)
    expect(dayOfSouthA).not.toBe(dayOfNorthA)
  })

  it('spreads items without coordinates evenly across days rather than dumping them all on day 1', () => {
    const items = [item('A'), item('B'), item('C'), item('D')]
    const result = organizeItinerary(items, 2)
    const day1Count = result.filter((i) => i.day === 1).length
    const day2Count = result.filter((i) => i.day === 2).length
    expect(day1Count).toBe(2)
    expect(day2Count).toBe(2)
  })

  it('respects an item that already has a manually-assigned day instead of re-clustering it', () => {
    const items = [
      item('Pinned to day 2', { day: 2, lat: 40.0, lng: -73.9 }),
      item('Unassigned', { lat: 40.0, lng: -73.9 }),
    ]
    const result = organizeItinerary(items, 3)
    expect(result.find((i) => i.text === 'Pinned to day 2')?.day).toBe(2)
  })
})
