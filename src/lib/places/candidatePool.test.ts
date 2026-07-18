import { describe, it, expect } from 'vitest'
import { buildCandidatePool, type PoolPlace } from './candidatePool'

/** A nearby pool shaped like a real one: food outrates the sights, as it does almost everywhere. */
function nearbyPool(): PoolPlace[] {
  return [
    { name: 'Great Cafe', category: 'cafe', rating: 4.9 },
    { name: 'Best Bistro', category: 'restaurant', rating: 4.8 },
    { name: 'Top Bakery', category: 'bakery', rating: 4.8 },
    { name: 'Nice Diner', category: 'restaurant', rating: 4.7 },
    { name: 'Corner Bar', category: 'bar', rating: 4.6 },
    { name: 'Local Museum', category: 'museum', rating: 4.2 },
    { name: 'City Park', category: 'park', rating: 4.0 },
    { name: 'Boat Launch', category: 'point_of_interest' },
  ]
}

describe('buildCandidatePool', () => {
  it('puts interest-matched places first, ahead of higher-rated food', () => {
    const themed: PoolPlace[] = [{ name: 'Walleye Guide Service', category: 'travel_agency', rating: 4.1 }]
    const pool = buildCandidatePool(nearbyPool(), themed, 3)
    expect(pool[0].name).toBe('Walleye Guide Service')
    expect(pool[0].themed).toBe(true)
  })

  it('marks nearby places as not themed', () => {
    const pool = buildCandidatePool(nearbyPool(), [], 3)
    expect(pool.every((p) => p.themed === false)).toBe(true)
  })

  it('caps food so it cannot crowd out the real things to do', () => {
    // 1 day => a budget of 3 food candidates, though 5 are available.
    const pool = buildCandidatePool(nearbyPool(), [], 1)
    const food = pool.filter((p) => ['cafe', 'restaurant', 'bakery', 'bar'].includes(p.category))
    expect(food).toHaveLength(3)
    // every non-food place survives, including the unrated boat launch
    expect(pool.map((p) => p.name)).toEqual(expect.arrayContaining(['Local Museum', 'City Park', 'Boat Launch']))
  })

  it('offers more food candidates for a longer trip', () => {
    const longTrip = buildCandidatePool(nearbyPool(), [], 5)
    const food = longTrip.filter((p) => ['cafe', 'restaurant', 'bakery', 'bar'].includes(p.category))
    expect(food).toHaveLength(5)
  })

  it('keeps unrated places, which sightseeing and outdoor spots often are', () => {
    const pool = buildCandidatePool(nearbyPool(), [], 3)
    expect(pool.map((p) => p.name)).toContain('Boat Launch')
  })

  it('deduplicates by name, letting the themed copy win', () => {
    const nearby: PoolPlace[] = [{ name: 'Rainy Lake Marina', category: 'point_of_interest', rating: 4.0 }]
    const themed: PoolPlace[] = [{ name: 'rainy lake marina', category: 'travel_agency', rating: 4.0 }]
    const pool = buildCandidatePool(nearby, themed, 3)
    expect(pool).toHaveLength(1)
    expect(pool[0].themed).toBe(true)
  })

  it('still reserves meal options when themed places would fill the whole pool', () => {
    const themed: PoolPlace[] = Array.from({ length: 60 }, (_, i) => ({
      name: `Trailhead ${i}`,
      category: 'park',
      rating: 4.5,
    }))
    const pool = buildCandidatePool(nearbyPool(), themed, 2)
    expect(pool).toHaveLength(40)
    const food = pool.filter((p) => ['cafe', 'restaurant', 'bakery', 'bar'].includes(p.category))
    expect(food.length).toBeGreaterThanOrEqual(1)
  })

  it('never exceeds the pool cap', () => {
    const themed: PoolPlace[] = Array.from({ length: 100 }, (_, i) => ({ name: `T${i}`, category: 'park' }))
    expect(buildCandidatePool(nearbyPool(), themed, 3)).toHaveLength(40)
  })

  it('honours a custom cap', () => {
    expect(buildCandidatePool(nearbyPool(), [], 3, { maxCandidates: 4 })).toHaveLength(4)
  })

  describe('when the trip is about food', () => {
    it('treats restaurants as the theme rather than as filler', () => {
      const pool = buildCandidatePool(nearbyPool(), [], 3, { foodFocused: true })
      const food = pool.filter((p) => ['cafe', 'restaurant', 'bakery', 'bar'].includes(p.category))
      // every food place survives, and each is marked as on-theme
      expect(food).toHaveLength(5)
      expect(food.every((p) => p.themed === true)).toBe(true)
    })

    it('does not cap food by trip length', () => {
      // 1 day would otherwise allow only 3 food candidates
      const pool = buildCandidatePool(nearbyPool(), [], 1, { foodFocused: true })
      const food = pool.filter((p) => ['cafe', 'restaurant', 'bakery', 'bar'].includes(p.category))
      expect(food).toHaveLength(5)
    })

    it('still keeps the real sights in the pool', () => {
      const pool = buildCandidatePool(nearbyPool(), [], 3, { foodFocused: true })
      expect(pool.map((p) => p.name)).toEqual(expect.arrayContaining(['Local Museum', 'City Park']))
    })
  })

  it('returns an empty pool for an empty location rather than throwing', () => {
    expect(buildCandidatePool([], [], 3)).toEqual([])
  })
})
