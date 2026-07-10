import { describe, it, expect } from 'vitest'
import { haversineKm, dayEffort, formatEffort } from './dayEffort'
import type { ItineraryItem } from '../validation/schemas'

function stop(text: string, lat?: number, lng?: number): ItineraryItem {
  return { text, day: 1, lat, lng } as ItineraryItem
}

describe('haversineKm', () => {
  it('is ~0 for the same point', () => {
    expect(haversineKm({ lat: 38.7, lng: -9.1 }, { lat: 38.7, lng: -9.1 })).toBeCloseTo(0, 5)
  })

  it('measures a known short distance', () => {
    // ~1 km apart in Lisbon
    const km = haversineKm({ lat: 38.7071, lng: -9.1355 }, { lat: 38.7161, lng: -9.1355 })
    expect(km).toBeGreaterThan(0.9)
    expect(km).toBeLessThan(1.1)
  })
})

describe('dayEffort', () => {
  it('returns null with fewer than two located stops', () => {
    expect(dayEffort([])).toBeNull()
    expect(dayEffort([stop('A', 38.7, -9.1)])).toBeNull()
    expect(dayEffort([stop('A', 38.7, -9.1), stop('B')])).toBeNull()
  })

  it('sums distance across consecutive located stops', () => {
    const e = dayEffort([stop('A', 38.70, -9.14), stop('B', 38.71, -9.14), stop('C', 38.72, -9.14)])
    expect(e).not.toBeNull()
    expect(e!.km).toBeGreaterThan(2)
    expect(e!.km).toBeLessThan(2.5)
    expect(e!.crossTown).toBe(false)
    expect(e!.walkMinutes).toBeGreaterThan(0)
  })

  it('flags a cross-town day past the threshold', () => {
    const e = dayEffort([stop('A', 38.70, -9.20), stop('B', 38.80, -9.05)])
    expect(e!.crossTown).toBe(true)
  })
})

describe('formatEffort', () => {
  it('formats sub-hour walking', () => {
    expect(formatEffort({ km: 2.4, walkMinutes: 32, crossTown: false })).toBe('~2.4 km · ~32 min walking')
  })

  it('formats hours and minutes', () => {
    expect(formatEffort({ km: 6.0, walkMinutes: 80, crossTown: false })).toBe('~6.0 km · ~1 hr 20 min walking')
  })

  it('drops minutes at an exact hour', () => {
    expect(formatEffort({ km: 4.5, walkMinutes: 60, crossTown: false })).toBe('~4.5 km · ~1 hr walking')
  })
})
