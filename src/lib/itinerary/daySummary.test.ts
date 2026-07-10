import { describe, it, expect } from 'vitest'
import { daySummary, daySummaryChips } from './daySummary'

describe('daySummary', () => {
  it('buckets categories into food, outdoors, and attractions', () => {
    const items = [
      { category: 'restaurant' },
      { category: 'cafe' },
      { category: 'park' },
      { category: 'museum' },
      { category: 'tourist_attraction' },
    ]
    expect(daySummary(items)).toEqual({ food: 2, outdoors: 1, attractions: 2 })
  })

  it('treats an unknown or missing category as an attraction', () => {
    expect(daySummary([{ category: undefined }, { category: 'point_of_interest' }])).toEqual({ food: 0, outdoors: 0, attractions: 2 })
  })

  it('is all zero for an empty day', () => {
    expect(daySummary([])).toEqual({ food: 0, outdoors: 0, attractions: 0 })
  })
})

describe('daySummaryChips', () => {
  it('omits empty buckets and singularizes sights', () => {
    expect(daySummaryChips({ food: 2, outdoors: 0, attractions: 1 })).toEqual([
      { key: 'attractions', label: '1 sight' },
      { key: 'food', label: '2 food' },
    ])
  })

  it('pluralizes sights and includes outdoors', () => {
    expect(daySummaryChips({ food: 0, outdoors: 1, attractions: 3 })).toEqual([
      { key: 'attractions', label: '3 sights' },
      { key: 'outdoors', label: '1 outdoors' },
    ])
  })

  it('returns nothing for an empty day', () => {
    expect(daySummaryChips({ food: 0, outdoors: 0, attractions: 0 })).toEqual([])
  })
})
