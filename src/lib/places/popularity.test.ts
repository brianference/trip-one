import { describe, it, expect } from 'vitest'
import { popularityScore, byPopularity } from './popularity'

describe('popularityScore', () => {
  it('ranks an iconic high-volume attraction above an obscure higher-starred one', () => {
    const guinness = { rating: 4.3, numReviews: 50000 }
    const obscureCafe = { rating: 4.8, numReviews: 40 }
    expect(popularityScore(guinness)).toBeGreaterThan(popularityScore(obscureCafe))
  })

  it('rewards review volume at the same rating', () => {
    expect(popularityScore({ rating: 4.5, numReviews: 10000 })).toBeGreaterThan(
      popularityScore({ rating: 4.5, numReviews: 100 }),
    )
  })

  it('gives an unrated real place a non-zero fallback score', () => {
    expect(popularityScore({})).toBeGreaterThan(0)
  })
})

describe('byPopularity', () => {
  it('sorts most-popular first', () => {
    const places = [
      { name: 'cafe', rating: 4.9, numReviews: 30 },
      { name: 'landmark', rating: 4.2, numReviews: 80000 },
      { name: 'museum', rating: 4.6, numReviews: 5000 },
    ]
    const sorted = [...places].sort(byPopularity).map((p) => p.name)
    expect(sorted).toEqual(['landmark', 'museum', 'cafe'])
  })
})
