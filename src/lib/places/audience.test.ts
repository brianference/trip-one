import { describe, it, expect } from 'vitest'
import { isAdultVenue, isKidVenue, fitsAudience } from './audience'

describe('isAdultVenue', () => {
  it('catches a pure drinking venue whose category was promoted to restaurant', () => {
    // A bar that is not also an eatery: types carry `bar` and nothing to eat.
    expect(isAdultVenue({ name: 'The Local Watering Hole', category: 'restaurant', types: ['bar'] })).toBe(true)
    expect(isAdultVenue({ name: 'Somewhere', category: 'restaurant', types: ['night_club', 'restaurant'] })).toBe(true)
  })

  // Google tags any restaurant with a drinks licence as `bar`. Treating that
  // as decisive flagged Pinky G's Pizzeria, a family pizza place, and Bar T 5,
  // a family chuckwagon show — both of which a family trip should keep.
  it('does not flag an eatery merely because it serves drinks', () => {
    expect(isAdultVenue({ name: "Pinky G's Pizzeria", category: 'restaurant', types: ['bar', 'restaurant'] })).toBe(false)
    expect(isAdultVenue({ name: 'Bar T 5', category: 'restaurant', types: ['restaurant'] })).toBe(false)
    expect(isAdultVenue({ name: 'Bar Harbor Inn', category: 'restaurant' })).toBe(false)
    expect(isAdultVenue({ name: 'Sushi Bar Tokyo', category: 'restaurant' })).toBe(false)
    expect(isAdultVenue({ name: 'The Juice Bar', category: 'cafe' })).toBe(false)
  })

  // The other family-trip leak: no useful types, but the name says it outright.
  it('catches a drinking venue by name when types are unavailable', () => {
    expect(isAdultVenue({ name: 'Local Restaurant & Bar', category: 'restaurant' })).toBe(true)
    expect(isAdultVenue({ name: 'The Old Storehouse Bar and Restaurant', category: 'restaurant' })).toBe(true)
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
      'Bar T 5',
      'Bar Harbor Lobster Pound',
      'The Snack Bar',
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
  const saloon = { name: 'The Cobblestone Pub', category: 'restaurant', types: ['bar'] }
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
