import { describe, it, expect } from 'vitest'
import { buildPlanPrompt, normalizePlan, extractPlanMessage, balanceDayFood, maxIncidentalFood } from './aiPlan'

const candidates = [
  { name: 'Ramen Shop', category: 'restaurant', rating: 4.6 },
  { name: 'War Museum', category: 'museum' },
  { name: 'Sushi Bar', category: 'restaurant', rating: 4.8 },
]

describe('buildPlanPrompt', () => {
  it('numbers the real places and fences the untrusted request', () => {
    const p = buildPlanPrompt({ intent: 'love ramen', days: 2, candidates })
    expect(p).toContain('0) Ramen Shop [restaurant, rated 4.6]')
    expect(p).toContain('2) Sushi Bar [restaurant, rated 4.8]')
    expect(p).toContain('love ramen')
    expect(p).toContain('not instructions')
  })

  it('asks for a friendly message alongside the grounded days', () => {
    const p = buildPlanPrompt({ intent: 'love ramen', days: 2, candidates })
    expect(p).toContain('"message"')
    expect(p).toContain('never mentions indices')
  })

  it('truncates an over-long request to guard against abuse', () => {
    const p = buildPlanPrompt({ intent: 'x'.repeat(2000), days: 1, candidates })
    expect(p).not.toContain('x'.repeat(600))
  })

  it('includes the current itinerary and edit instruction when editing', () => {
    const p = buildPlanPrompt({
      intent: 'make day 2 more relaxed',
      days: 2,
      candidates,
      currentPlan: [{ day: 2, placeNames: ['War Museum', 'Sushi Bar'] }],
    })
    expect(p).toContain('CURRENT ITINERARY:')
    expect(p).toContain('Day 2: War Museum, Sushi Bar')
    expect(p).toContain('Treat the latest request as an EDIT')
  })

  it('includes recent conversation turns as fenced data', () => {
    const p = buildPlanPrompt({
      intent: 'add more food',
      days: 2,
      candidates,
      conversation: [
        { role: 'user', content: 'a relaxed foodie trip' },
        { role: 'assistant', content: 'Here is a relaxed plan.' },
      ],
    })
    expect(p).toContain('CONVERSATION SO FAR')
    expect(p).toContain('Traveler: a relaxed foodie trip')
    expect(p).toContain('Planner: Here is a relaxed plan.')
  })
})

describe('extractPlanMessage', () => {
  it('returns a trimmed message when present', () => {
    expect(extractPlanMessage({ message: '  Built a 3-day trip.  ' })).toBe('Built a 3-day trip.')
  })

  it('returns null for missing, blank, or non-string messages', () => {
    expect(extractPlanMessage({ days: [] })).toBeNull()
    expect(extractPlanMessage({ message: '   ' })).toBeNull()
    expect(extractPlanMessage({ message: 42 })).toBeNull()
    expect(extractPlanMessage('nope')).toBeNull()
    expect(extractPlanMessage(null)).toBeNull()
  })

  it('caps an over-long message', () => {
    expect(extractPlanMessage({ message: 'x'.repeat(1000) })?.length).toBe(600)
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

interface TestPlace {
  name: string
  category: string
  lat?: number
  lng?: number
  rating?: number
  themed?: boolean
}

describe('maxIncidentalFood', () => {
  it('allows about a third of a day to be food', () => {
    expect(maxIncidentalFood(4)).toBe(2)
    expect(maxIncidentalFood(6)).toBe(3)
  })

  it('always allows at least one meal, even on a day with nothing else', () => {
    expect(maxIncidentalFood(0)).toBe(1)
    expect(maxIncidentalFood(1)).toBe(1)
  })

  it('never allows more than three food stops in a day', () => {
    expect(maxIncidentalFood(20)).toBe(3)
  })
})

describe('balanceDayFood', () => {
  // 0,1 = attractions near (0,0); 2,3,4 = food near (0,0); 5,6 = food far (10,10)
  const candidates: TestPlace[] = [
    { name: 'Museum A', category: 'museum', lat: 0.0, lng: 0.0 },
    { name: 'Park B', category: 'park', lat: 0.01, lng: 0.01 },
    { name: 'Cafe Near', category: 'cafe', lat: 0.02, lng: 0.0, rating: 4.5 },
    { name: 'Bistro Near', category: 'restaurant', lat: 0.0, lng: 0.02, rating: 4.6 },
    { name: 'Bar Near', category: 'bar', lat: 0.03, lng: 0.01, rating: 4.2 },
    { name: 'Diner Far', category: 'restaurant', lat: 10.0, lng: 10.0, rating: 4.9 },
    { name: 'Grill Far', category: 'restaurant', lat: 10.1, lng: 10.1, rating: 4.8 },
  ]
  const isFood = (i: number) => ['cafe', 'restaurant', 'bar'].includes(candidates[i].category)

  it('gives a day with no food a meal, choosing the nearest to that day’s stops', () => {
    const out = balanceDayFood([{ day: 1, placeIndexes: [0, 1] }], candidates)
    expect(out[0].placeIndexes.filter(isFood).length).toBeGreaterThanOrEqual(1)
    // the far, higher-rated restaurants (5,6) are NOT chosen over the near ones
    expect(out[0].placeIndexes).not.toContain(5)
    expect(out[0].placeIndexes).not.toContain(6)
  })

  it('trims incidental food back to its share of the day', () => {
    // one attraction + three food stops -> ceiling of 1 incidental food
    const out = balanceDayFood([{ day: 1, placeIndexes: [0, 2, 3, 4] }], candidates)
    expect(out[0].placeIndexes.filter(isFood)).toHaveLength(1)
    expect(out[0].placeIndexes).toContain(0)
  })

  it('keeps food the traveler actually asked for, over the incidental ceiling', () => {
    // A wine/food trip: the food IS the theme, so none of it is trimmed.
    const themedFood: TestPlace[] = candidates.map((c, i) =>
      i >= 2 && i <= 4 ? { ...c, themed: true } : c,
    )
    const out = balanceDayFood([{ day: 1, placeIndexes: [0, 2, 3, 4] }], themedFood)
    expect(out[0].placeIndexes).toEqual([0, 2, 3, 4])
  })

  it('does not fill a day past the minimum just because food is available', () => {
    const out = balanceDayFood([{ day: 1, placeIndexes: [0, 1] }], candidates)
    expect(out[0].placeIndexes.filter(isFood)).toHaveLength(1)
  })

  it('never reuses a food place across days', () => {
    const out = balanceDayFood([{ day: 1, placeIndexes: [0] }, { day: 2, placeIndexes: [1] }], candidates)
    const all = out.flatMap((d) => d.placeIndexes)
    expect(new Set(all).size).toBe(all.length)
  })

  it('leaves a day with no food when the pool has none at all', () => {
    const noFood: TestPlace[] = [
      { name: 'Museum A', category: 'museum' },
      { name: 'Park B', category: 'park' },
    ]
    const out = balanceDayFood([{ day: 1, placeIndexes: [0, 1] }], noFood)
    expect(out[0].placeIndexes).toEqual([0, 1])
  })
})
