import { describe, it, expect } from 'vitest'
import { isAdultVenue, isKidVenue, fitsAudience } from './audience'

describe('isAdultVenue', () => {
  // The exact venue that reached day 4 of a 7-day family ski trip. Places
  // returns types ['bar', 'restaurant', ...] and the food promotion in
  // places.ts rewrites category to 'restaurant', so only `types` reveals it.
  it('catches a saloon whose category was promoted to restaurant', () => {
    expect(
      isAdultVenue({ name: 'Mangy Moose Jackson Hole', category: 'restaurant', types: ['bar', 'restaurant'] }),
    ).toBe(true)
  })

  // The other family-trip leak: no useful types, but the name says it outright.
  it('catches a drinking venue by name when types are unavailable', () => {
    expect(isAdultVenue({ name: 'Local Restaurant & Bar', category: 'restaurant' })).toBe(true)
    expect(isAdultVenue({ name: 'The Cobblestone Pub', category: 'restaurant' })).toBe(true)
    expect(isAdultVenue({ name: 'Teeling Whiskey Distillery', category: 'cafe' })).toBe(true)
  })

  it('trusts a precomputed flag', () => {
    expect(isAdultVenue({ name: 'Anon', category: 'restaurant', adultVenue: true })).toBe(true)
  })

  // False positives here silently delete good family restaurants, so the name
  // pattern must match whole words only.
  it('does not fire on words that merely contain a drink token', () => {
    const safe = [
      'Barbecue Shack',
      'The Red Barn Cafe',
      'Barista Coffee House',
      'Public Library',
      'Barnes Family Diner',
      'Persephone Bakery',
      'The Bunnery Bakery & Restaurant',
      'Rhubarb Cafe',
    ]
    for (const name of safe) {
      expect(isAdultVenue({ name, category: 'restaurant' }), name).toBe(false)
    }
  })
})

describe('isKidVenue', () => {
  it('catches kid attractions by type and by name', () => {
    expect(isKidVenue({ name: 'Dublin Zoo', category: 'zoo' })).toBe(true)
    expect(isKidVenue({ name: 'Somewhere', category: 'x', types: ['aquarium'] })).toBe(true)
    expect(isKidVenue({ name: "Jackson Hole Children's Museum", category: 'museum' })).toBe(true)
  })

  it('leaves ordinary attractions alone', () => {
    expect(isKidVenue({ name: 'National Gallery of Ireland', category: 'art_gallery' })).toBe(false)
  })
})

describe('fitsAudience', () => {
  const saloon = { name: 'Mangy Moose Jackson Hole', category: 'restaurant', types: ['bar', 'restaurant'] }
  const zoo = { name: 'Dublin Zoo', category: 'zoo' }
  const neutral = { name: 'Grand Teton National Park', category: 'tourist_attraction' }

  it('keeps drinking venues off a kids trip', () => {
    expect(fitsAudience(saloon, 'kids')).toBe(false)
    expect(fitsAudience(neutral, 'kids')).toBe(true)
    expect(fitsAudience(zoo, 'kids')).toBe(true)
  })

  it('keeps kid attractions off an adults trip', () => {
    expect(fitsAudience(zoo, 'adults')).toBe(false)
    expect(fitsAudience(saloon, 'adults')).toBe(true)
  })

  it('filters nothing for a general audience', () => {
    for (const p of [saloon, zoo, neutral]) expect(fitsAudience(p, 'general')).toBe(true)
    for (const p of [saloon, zoo, neutral]) expect(fitsAudience(p, undefined)).toBe(true)
  })
})
