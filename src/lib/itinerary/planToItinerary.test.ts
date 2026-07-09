import { describe, it, expect } from 'vitest'
import { planToItinerary } from './planToItinerary'
import type { ThingToDo, PlanDay } from '../api/client'

const places: ThingToDo[] = [
  { name: 'Balboa Park', category: 'park', source: 'places', lat: 32.73, lng: -117.14 },
  { name: 'Birch Aquarium', category: 'aquarium', source: 'places', lat: 32.87, lng: -117.25 },
  { name: 'USS Midway', category: 'museum', source: 'places', lat: 32.71, lng: -117.17 },
]

describe('planToItinerary', () => {
  it('maps grounded indices to real places, carrying coords/category and the AI day', () => {
    const plan: PlanDay[] = [
      { day: 1, placeIndexes: [0, 2] },
      { day: 2, placeIndexes: [1] },
    ]
    const items = planToItinerary(plan, places)
    expect(items).toHaveLength(3)
    expect(items[0]).toMatchObject({ text: 'Balboa Park', category: 'park', lat: 32.73, lng: -117.14, day: 1 })
    expect(items[1]).toMatchObject({ text: 'USS Midway', day: 1 })
    expect(items[2]).toMatchObject({ text: 'Birch Aquarium', day: 2 })
  })

  it('skips out-of-range indices so a bad index never fabricates a stop', () => {
    const plan: PlanDay[] = [{ day: 1, placeIndexes: [0, 99, -1] }]
    const items = planToItinerary(plan, places)
    expect(items).toHaveLength(1)
    expect(items[0].text).toBe('Balboa Park')
  })

  it('returns an empty itinerary for an empty plan', () => {
    expect(planToItinerary([], places)).toEqual([])
  })

  it('sets each item as a searchable option stop', () => {
    const items = planToItinerary([{ day: 1, placeIndexes: [0] }], places)
    expect(items[0].type).toBe('option')
    expect(items[0].q).toBe('Balboa Park')
  })
})
