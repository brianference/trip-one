import { describe, it, expect } from 'vitest'
import { cleanDisplayName } from './displayName'

describe('cleanDisplayName', () => {
  it('drops county and country for a US city -> City, State', () => {
    expect(cleanDisplayName('Miami, Miami-Dade County, Florida, United States')).toBe('Miami, Florida')
  })

  it('drops a bare postal code and county for a US place', () => {
    expect(cleanDisplayName('Miami, Roberts County, Texas, 79059, United States')).toBe('Miami, Texas')
  })

  it('keeps a US national park name and its state', () => {
    expect(cleanDisplayName('Yellowstone National Park, Park County, Wyoming, United States')).toBe(
      'Yellowstone National Park, Wyoming',
    )
  })

  it('drops county for a non-US place -> City, Country', () => {
    expect(cleanDisplayName('Dublin, County Dublin, Ireland')).toBe('Dublin, Ireland')
  })

  it('collapses extra middle regions to City, Country for non-US', () => {
    expect(cleanDisplayName('Barcelona, Barcelonès, Barcelona, Catalonia, Spain')).toBe('Barcelona, Spain')
  })

  it('leaves an already-clean two-part name unchanged', () => {
    expect(cleanDisplayName('Tokyo, Japan')).toBe('Tokyo, Japan')
  })

  it('returns a single-segment name unchanged', () => {
    expect(cleanDisplayName('Iceland')).toBe('Iceland')
  })
})
