import { describe, it, expect } from 'vitest'
import { isExperienceCategory } from './experienceFilter'

describe('isExperienceCategory', () => {
  it('keeps genuine experiences', () => {
    expect(isExperienceCategory('museum')).toBe(true)
    expect(isExperienceCategory('restaurant')).toBe(true)
    expect(isExperienceCategory('park')).toBe(true)
    expect(isExperienceCategory('tourist_attraction')).toBe(true)
  })

  it('drops lodging so hotels never become itinerary stops', () => {
    expect(isExperienceCategory('lodging')).toBe(false)
  })

  it('drops service/utility categories', () => {
    expect(isExperienceCategory('gym')).toBe(false)
    expect(isExperienceCategory('atm')).toBe(false)
    expect(isExperienceCategory('car_rental')).toBe(false)
    expect(isExperienceCategory('gas_station')).toBe(false)
    expect(isExperienceCategory('hair_care')).toBe(false)
  })

  it('errs toward keeping unknown categories', () => {
    expect(isExperienceCategory('some_new_google_type')).toBe(true)
    expect(isExperienceCategory('')).toBe(true)
  })
})
