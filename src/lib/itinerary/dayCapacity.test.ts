import { describe, it, expect } from 'vitest'
import {
  FULL_DAY_MINUTES,
  HALF_DAY_MINUTES,
  durationClass,
  dayDurationClass,
  maxAdditionalAttractions,
  maxFoodForDay,
  foodFloorForDay,
  foodCeilingForDay,
  isExperiencePlace,
  enforceAttractionCapacity,
  formatDurationMinutes,
  type CapacityStop,
} from './dayCapacity'

const isFood = (category: string | undefined) =>
  category != null && ['restaurant', 'cafe', 'bar', 'bakery'].includes(category)

describe('named thresholds', () => {
  it('exports the documented full-day and half-day minutes', () => {
    expect(FULL_DAY_MINUTES).toBe(360)
    expect(HALF_DAY_MINUTES).toBe(240)
  })
})

describe('durationClass', () => {
  it('classifies full, half, and shorter durations from real minutes', () => {
    expect(durationClass(720)).toBe('full')
    expect(durationClass(FULL_DAY_MINUTES)).toBe('full')
    expect(durationClass(HALF_DAY_MINUTES)).toBe('half')
    expect(durationClass(300)).toBe('half')
    expect(durationClass(120)).toBe('normal')
  })

  it('treats unknown or invalid duration as normal — never invents a default', () => {
    expect(durationClass(undefined)).toBe('normal')
    expect(durationClass(NaN)).toBe('normal')
    expect(durationClass(0)).toBe('normal')
    expect(durationClass(-30)).toBe('normal')
  })
})

describe('dayDurationClass / attraction and food caps', () => {
  it('full-day experience → no other attractions and food capped at 1', () => {
    const stops: CapacityStop[] = [
      { isExperience: true, durationMinutes: 720 },
      { isFood: false },
      { isFood: true },
    ]
    expect(dayDurationClass(stops)).toBe('full')
    expect(maxAdditionalAttractions(stops)).toBe(0)
    expect(maxFoodForDay(stops)).toBe(1)
  })

  it('half-day experience → at most one additional attraction; normal food rules', () => {
    const stops: CapacityStop[] = [{ isExperience: true, durationMinutes: 240 }]
    expect(dayDurationClass(stops)).toBe('half')
    expect(maxAdditionalAttractions(stops)).toBe(1)
    expect(maxFoodForDay(stops)).toBeNull()
  })

  it('unknown duration experience keeps unlimited attractions (today\'s behaviour)', () => {
    const stops: CapacityStop[] = [{ isExperience: true }]
    expect(dayDurationClass(stops)).toBe('normal')
    expect(maxAdditionalAttractions(stops)).toBeNull()
    expect(maxFoodForDay(stops)).toBeNull()
  })

  it('non-experience long duration does not tighten the day', () => {
    // A museum with a made-up long visit is still a free POI, not a bookable tour.
    const stops: CapacityStop[] = [{ isExperience: false, durationMinutes: 720 }]
    expect(dayDurationClass(stops)).toBe('normal')
    expect(maxAdditionalAttractions(stops)).toBeNull()
  })

  it('foodFloorForDay never exceeds the full-day food cap', () => {
    const full: CapacityStop[] = [{ isExperience: true, durationMinutes: FULL_DAY_MINUTES }]
    expect(foodFloorForDay(full, 3)).toBe(1)
    expect(foodFloorForDay(full, 1)).toBe(1)
    expect(foodFloorForDay([], 1)).toBe(1)
  })

  it('foodCeilingForDay caps full-day food at 1', () => {
    const full: CapacityStop[] = [{ isExperience: true, durationMinutes: FULL_DAY_MINUTES }]
    expect(foodCeilingForDay(full, 3)).toBe(1)
    expect(foodCeilingForDay([], 3)).toBe(3)
  })
})

describe('isExperiencePlace', () => {
  it('honours the explicit flag and Viator source', () => {
    expect(isExperiencePlace({ isExperience: true })).toBe(true)
    expect(isExperiencePlace({ source: 'viator' })).toBe(true)
    expect(isExperiencePlace({ source: 'places' })).toBe(false)
    expect(isExperiencePlace({})).toBe(false)
  })
})

describe('enforceAttractionCapacity', () => {
  const candidates = [
    { name: 'Yellowstone Day Tour', category: 'tour', isExperience: true, durationMinutes: 720 },
    { name: 'Town Museum', category: 'museum' },
    { name: 'City Park', category: 'park' },
    { name: 'Local Cafe', category: 'cafe' },
    { name: 'Bistro', category: 'restaurant' },
    { name: 'Short Raft Trip', category: 'tour', isExperience: true, durationMinutes: 180 },
    { name: 'Half-Day Hike', category: 'tour', isExperience: true, durationMinutes: 300 },
    { name: 'Unknown Tour', category: 'tour', isExperience: true },
  ]

  it('full-day experience → no other attractions; food left for the food balancer', () => {
    // Day stacked as if the model + old food filler ran: tour + two sights + two meals.
    const out = enforceAttractionCapacity([0, 1, 2, 3, 4], candidates, isFood)
    expect(out).toContain(0)
    expect(out).not.toContain(1)
    expect(out).not.toContain(2)
    // Food is not trimmed here — balanceDayFood applies the food cap.
    expect(out).toContain(3)
    expect(out).toContain(4)
  })

  /**
   * Live-measured case: Yellowstone tours anchor on Jackson Hole but pin
   * ~110 km away (a real day trip). Day clustering sorts by latitude, so a
   * far pin would pull other stops onto that day. The full-day rule isolates
   * the tour so that cannot happen after capacity enforcement.
   */
  it('isolates a far-pinned full-day Yellowstone tour from other attractions', () => {
    const yellowstone = {
      name: 'Yellowstone National Park Day Tour',
      category: 'tour',
      isExperience: true,
      durationMinutes: 720,
      lat: 44.6,
      lng: -110.5,
    }
    const jacksonStops = [
      yellowstone,
      { name: 'Town Square', category: 'tourist_attraction', lat: 43.48, lng: -110.76 },
      { name: 'National Museum of Wildlife Art', category: 'museum', lat: 43.48, lng: -110.76 },
      { name: 'Snake River Grill', category: 'restaurant', lat: 43.48, lng: -110.76 },
      { name: 'Persephone Bakery', category: 'bakery', lat: 43.48, lng: -110.76 },
    ]
    const out = enforceAttractionCapacity([0, 1, 2, 3, 4], jacksonStops, isFood)
    expect(out.filter((i) => !isFood(jacksonStops[i].category) && i !== 0)).toEqual([])
    expect(out).toContain(0)
    // At most the food remains alongside the tour (food cap applied later).
    expect(out.every((i) => i === 0 || isFood(jacksonStops[i].category))).toBe(true)
  })

  it('half-day experience allows at most one additional attraction', () => {
    const out = enforceAttractionCapacity([6, 1, 2, 3], candidates, isFood)
    const attractions = out.filter((i) => i !== 6 && !isFood(candidates[i].category))
    expect(attractions).toHaveLength(1)
    expect(out).toContain(6)
    expect(out).toContain(3) // food kept
  })

  it('unknown duration experience does not trim attractions', () => {
    const out = enforceAttractionCapacity([7, 1, 2, 3], candidates, isFood)
    expect(out).toEqual([7, 1, 2, 3])
  })

  it('keeps at most one experience per day', () => {
    const out = enforceAttractionCapacity([0, 5, 3], candidates, isFood)
    const experiences = out.filter((i) => candidates[i].isExperience)
    expect(experiences).toEqual([0])
  })

  it('leaves a day with no experiences unchanged', () => {
    expect(enforceAttractionCapacity([1, 2, 3], candidates, isFood)).toEqual([1, 2, 3])
  })
})

describe('formatDurationMinutes', () => {
  it('uses real minutes without rounding up into a longer claim', () => {
    expect(formatDurationMinutes(180)).toBe('about 3 hours')
    expect(formatDurationMinutes(200)).toBe('about 3 hours 20 minutes')
    expect(formatDurationMinutes(60)).toBe('about 1 hour')
    expect(formatDurationMinutes(45)).toBe('about 45 minutes')
    expect(formatDurationMinutes(90)).toBe('about 1 hour 30 minutes')
  })

  it('returns empty for non-positive or non-finite input', () => {
    expect(formatDurationMinutes(0)).toBe('')
    expect(formatDurationMinutes(-10)).toBe('')
    expect(formatDurationMinutes(NaN)).toBe('')
  })
})
