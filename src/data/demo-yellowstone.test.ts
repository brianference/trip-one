import { describe, it, expect } from 'vitest'
import { itineraryItemSchema } from '../lib/validation/schemas'
import { DEMO_YELLOWSTONE } from './demo-yellowstone'

describe('DEMO_YELLOWSTONE', () => {
  it('every itinerary item passes validation', () => {
    for (const item of DEMO_YELLOWSTONE.itinerary) {
      expect(() => itineraryItemSchema.parse(item)).not.toThrow()
    }
  })

  it('contains no adult-venue or personal-booking content', () => {
    const text = JSON.stringify(DEMO_YELLOWSTONE).toLowerCase()
    for (const banned of ['confirmation', 'enterprise', 'count', 'nathan', 'lena']) {
      expect(text).not.toContain(banned)
    }
  })

  it('has a stable slug and coordinates', () => {
    expect(DEMO_YELLOWSTONE.slug).toBe('yellowstone-demo')
    expect(DEMO_YELLOWSTONE.lat).toBeCloseTo(44.6, 0)
  })
})
