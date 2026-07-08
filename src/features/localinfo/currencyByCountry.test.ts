import { describe, it, expect } from 'vitest'
import { currencyForDisplayName } from './currencyByCountry'

describe('currencyForDisplayName', () => {
  it('maps a known country segment to its currency code', () => {
    expect(currencyForDisplayName('Tokyo, Japan')).toBe('JPY')
  })

  it('matches the trailing segment case-insensitively with surrounding whitespace', () => {
    expect(currencyForDisplayName('Paris,  France ')).toBe('EUR')
  })

  it('handles a multi-segment display name, using only the last segment', () => {
    expect(currencyForDisplayName('Yellowstone National Park, Park County, Wyoming, United States')).toBe('USD')
  })

  it('falls back to USD for an unrecognized country', () => {
    expect(currencyForDisplayName('Somewhere, Neverland')).toBe('USD')
  })

  it('maps common tourist-destination countries missing from the original curated list', () => {
    expect(currencyForDisplayName('Marrakesh, Marrakesh-Safi, Morocco')).toBe('MAD')
    expect(currencyForDisplayName('Bangkok, Thailand')).toBe('THB')
    expect(currencyForDisplayName('Istanbul, Türkiye')).toBe('TRY')
    expect(currencyForDisplayName('Cairo, Egypt')).toBe('EGP')
  })

  it('maps a euro-adopting country not in the original EU list', () => {
    expect(currencyForDisplayName('Dubrovnik, Croatia')).toBe('EUR')
  })
})
