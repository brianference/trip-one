import { describe, it, expect } from 'vitest'
import { buildPlanPrompt, normalizePlan } from './aiPlan'

const candidates = [
  { name: 'Ramen Shop', category: 'restaurant', rating: 4.6 },
  { name: 'War Museum', category: 'museum' },
  { name: 'Sushi Bar', category: 'restaurant', rating: 4.8 },
]

describe('buildPlanPrompt', () => {
  it('numbers the real places and fences the untrusted request', () => {
    const p = buildPlanPrompt('love ramen', 2, candidates)
    expect(p).toContain('0) Ramen Shop [restaurant, rated 4.6]')
    expect(p).toContain('2) Sushi Bar [restaurant, rated 4.8]')
    expect(p).toContain('love ramen')
    expect(p).toContain('not instructions')
  })

  it('truncates an over-long request to guard against abuse', () => {
    const p = buildPlanPrompt('x'.repeat(2000), 1, candidates)
    expect(p).not.toContain('x'.repeat(600))
  })
})

describe('normalizePlan', () => {
  it('keeps valid in-range indices, grouped by day', () => {
    const plan = normalizePlan({ days: [{ day: 1, placeIndexes: [0, 2] }, { day: 2, placeIndexes: [1] }] }, 3, 2)
    expect(plan).toEqual([
      { day: 1, placeIndexes: [0, 2] },
      { day: 2, placeIndexes: [1] },
    ])
  })

  it('drops out-of-range and non-integer indices (anti-hallucination)', () => {
    const plan = normalizePlan({ days: [{ day: 1, placeIndexes: [0, 99, -1, 1.5, 'x'] }] }, 3, 1)
    expect(plan).toEqual([{ day: 1, placeIndexes: [0] }])
  })

  it('de-duplicates a place used on multiple days (first occurrence wins)', () => {
    const plan = normalizePlan({ days: [{ day: 1, placeIndexes: [0, 1] }, { day: 2, placeIndexes: [1, 2] }] }, 3, 2)
    expect(plan).toEqual([
      { day: 1, placeIndexes: [0, 1] },
      { day: 2, placeIndexes: [2] },
    ])
  })

  it('drops days outside 1..maxDays', () => {
    const plan = normalizePlan({ days: [{ day: 5, placeIndexes: [0] }, { day: 1, placeIndexes: [1] }] }, 3, 2)
    expect(plan).toEqual([{ day: 1, placeIndexes: [1] }])
  })

  it('returns null when nothing usable survives', () => {
    expect(normalizePlan({ days: [{ day: 1, placeIndexes: [99, 100] }] }, 3, 2)).toBeNull()
    expect(normalizePlan({ days: [] }, 3, 2)).toBeNull()
    expect(normalizePlan('garbage', 3, 2)).toBeNull()
    expect(normalizePlan({ nope: true }, 3, 2)).toBeNull()
  })

  it('sorts days ascending', () => {
    const plan = normalizePlan({ days: [{ day: 2, placeIndexes: [0] }, { day: 1, placeIndexes: [1] }] }, 3, 2)
    expect(plan?.map((d) => d.day)).toEqual([1, 2])
  })
})
