import { describe, it, expect } from 'vitest'
import { languageForDisplayName } from './languageByCountry'

describe('languageForDisplayName', () => {
  it('maps a known country segment to its language', () => {
    expect(languageForDisplayName('Kyoto, Japan')).toBe('japanese')
  })

  it('matches the trailing segment case-insensitively with surrounding whitespace', () => {
    expect(languageForDisplayName('Paris,  France ')).toBe('french')
  })

  it('handles a multi-segment display name, using only the last segment', () => {
    expect(languageForDisplayName('Yellowstone National Park, Park County, Wyoming, United States')).toBeNull()
  })

  it('returns null for an unrecognized country', () => {
    expect(languageForDisplayName('Somewhere, Neverland')).toBeNull()
  })

  it('returns null for English-speaking countries (no phrasebook needed)', () => {
    expect(languageForDisplayName('London, United Kingdom')).toBeNull()
  })
})
