import { describe, it, expect } from 'vitest'
import { easeInOutCubic, interpolateLeg, legDurationMs, SUBSEGMENTS_PER_LEG } from './animateRoute'

describe('easeInOutCubic', () => {
  it('starts at 0', () => {
    expect(easeInOutCubic(0)).toBe(0)
  })

  it('is exactly 0.5 at the midpoint', () => {
    expect(easeInOutCubic(0.5)).toBe(0.5)
  })

  it('ends at 1', () => {
    expect(easeInOutCubic(1)).toBe(1)
  })

  it('eases in slower than linear during the first half', () => {
    expect(easeInOutCubic(0.25)).toBeLessThan(0.25)
  })

  it('eases out faster than linear during the second half', () => {
    expect(easeInOutCubic(0.75)).toBeGreaterThan(0.75)
  })
})

describe('interpolateLeg', () => {
  const a = { lat: 35.66, lng: 139.7 }
  const b = { lat: 35.72, lng: 139.8 }

  it('returns steps + 1 points', () => {
    expect(interpolateLeg(a, b, 60)).toHaveLength(61)
  })

  it('starts exactly at a and ends exactly at b', () => {
    const points = interpolateLeg(a, b, 10)
    expect(points[0]).toEqual(a)
    expect(points[points.length - 1]).toEqual(b)
  })

  it('interpolates evenly, landing on the midpoint for a 2-step split', () => {
    const points = interpolateLeg(a, b, 2)
    expect(points[1]).toEqual({ lat: (a.lat + b.lat) / 2, lng: (a.lng + b.lng) / 2 })
  })

  it('handles a zero-length leg (a equals b) without producing NaN', () => {
    const points = interpolateLeg(a, a, 4)
    expect(points).toHaveLength(5)
    for (const point of points) expect(point).toEqual(a)
  })
})

describe('legDurationMs', () => {
  it('matches the Tokyo One walkthrough timings', () => {
    expect(legDurationMs('slow')).toBe(4000)
    expect(legDurationMs('normal')).toBe(2500)
    expect(legDurationMs('fast')).toBe(1200)
  })
})

describe('SUBSEGMENTS_PER_LEG', () => {
  it('is 60, matching Tokyo One', () => {
    expect(SUBSEGMENTS_PER_LEG).toBe(60)
  })
})
