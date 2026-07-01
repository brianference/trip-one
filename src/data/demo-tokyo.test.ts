import { describe, it, expect } from 'vitest'
import { itineraryItemSchema } from '../lib/validation/schemas'
import { DEMO_TOKYO } from './demo-tokyo'

describe('DEMO_TOKYO', () => {
  it('every itinerary item passes validation', () => {
    for (const item of DEMO_TOKYO.itinerary) {
      expect(() => itineraryItemSchema.parse(item)).not.toThrow()
    }
  })

  it('contains no adult-venue, hostess-bar, or personal-address content', () => {
    const text = JSON.stringify(DEMO_TOKYO).toLowerCase()
    for (const banned of ['hostess', 'luxe shinjuku', 'origin hostess', 'vrbo', 'okubo']) {
      expect(text).not.toContain(banned)
    }
  })

  it('has a stable slug and coordinates', () => {
    expect(DEMO_TOKYO.slug).toBe('tokyo-demo')
    expect(DEMO_TOKYO.lat).toBeCloseTo(35.68, 1)
  })
})
