import { describe, it, expect } from 'vitest'
import { locationQuerySchema, itineraryItemSchema } from './schemas'

describe('locationQuerySchema', () => {
  it('accepts a normal location string', () => {
    expect(locationQuerySchema.parse('Dublin, Ireland')).toBe('Dublin, Ireland')
  })

  it('rejects an empty string', () => {
    expect(() => locationQuerySchema.parse('')).toThrow()
  })

  it('rejects a string over 200 chars', () => {
    expect(() => locationQuerySchema.parse('a'.repeat(201))).toThrow()
  })
})

describe('itineraryItemSchema', () => {
  it('accepts a minimal fixed item', () => {
    const item = { time: '09:00', text: 'Breakfast', type: 'fixed' as const }
    expect(itineraryItemSchema.parse(item)).toEqual(item)
  })

  it('accepts optional q and inout', () => {
    const item = {
      time: '09:00',
      text: 'Museum',
      type: 'option' as const,
      q: 'National Museum Dublin',
      inout: '9:00a · 11:00a',
    }
    expect(itineraryItemSchema.parse(item)).toEqual(item)
  })

  it('rejects an invalid type', () => {
    const bad = { time: '09:00', text: 'X', type: 'nonsense' }
    expect(() => itineraryItemSchema.parse(bad)).toThrow()
  })
})
