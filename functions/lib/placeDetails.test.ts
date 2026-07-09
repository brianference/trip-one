import { describe, it, expect } from 'vitest'
import { normalizePlaceDetail, PLACE_DETAILS_FIELDS } from './placeDetails'

const rawResult = {
  place_id: 'abc123',
  name: 'Sushi Ota',
  formatted_address: '4529 Mission Bay Dr, San Diego, CA',
  formatted_phone_number: '(858) 270-5670',
  rating: 4.5,
  user_ratings_total: 1731,
  price_level: 3,
  website: 'https://sushiota.com',
  url: 'https://maps.google.com/?cid=123',
  opening_hours: { open_now: true, weekday_text: ['Monday: 5–10 PM', 'Tuesday: 5–10 PM'] },
  editorial_summary: { overview: 'Longtime sushi favorite in Mission Bay.' },
  reviews: [
    { author_name: 'Jane', rating: 5, text: 'Incredibly fresh.', relative_time_description: 'a month ago' },
    { author_name: 'Bob', rating: 4, text: '', relative_time_description: 'a week ago' },
  ],
  photos: [{ photo_reference: 'ref1' }, { photo_reference: 'ref2' }],
  types: ['restaurant', 'food', 'point_of_interest'],
  serves_lunch: true,
  serves_dinner: true,
  serves_vegetarian_food: true,
}

describe('normalizePlaceDetail', () => {
  it('maps real Google fields into the compact shape', () => {
    const d = normalizePlaceDetail(rawResult, 'fallback')!
    expect(d.placeId).toBe('abc123')
    expect(d.name).toBe('Sushi Ota')
    expect(d.rating).toBe(4.5)
    expect(d.reviewCount).toBe(1731)
    expect(d.priceLevel).toBe(3)
    expect(d.phone).toBe('(858) 270-5670')
    expect(d.openNow).toBe(true)
    expect(d.hours).toEqual(['Monday: 5–10 PM', 'Tuesday: 5–10 PM'])
    expect(d.summary).toBe('Longtime sushi favorite in Mission Bay.')
    expect(d.mapsUrl).toBe('https://maps.google.com/?cid=123')
  })

  it('keeps only reviews with text and caps at three', () => {
    const d = normalizePlaceDetail(rawResult, 'fallback')!
    expect(d.reviews).toHaveLength(1)
    expect(d.reviews[0]).toMatchObject({ author: 'Jane', rating: 5, text: 'Incredibly fresh.' })
  })

  it('derives serves flags and photo refs, never inventing a menu', () => {
    const d = normalizePlaceDetail(rawResult, 'fallback')!
    expect(d.serves).toEqual(['lunch', 'dinner', 'vegetarian'])
    expect(d.photoRefs).toEqual(['ref1', 'ref2'])
  })

  it('falls back to the top review text when there is no editorial summary', () => {
    const d = normalizePlaceDetail({ ...rawResult, editorial_summary: undefined }, 'fallback')!
    expect(d.summary).toBe('Incredibly fresh.')
  })

  it('uses the fallback place id when the result omits one', () => {
    const d = normalizePlaceDetail({ ...rawResult, place_id: undefined }, 'fallback-id')!
    expect(d.placeId).toBe('fallback-id')
  })

  it('returns null when there is no name to show', () => {
    expect(normalizePlaceDetail({ place_id: 'x' }, 'x')).toBeNull()
    expect(normalizePlaceDetail(null, 'x')).toBeNull()
  })

  it('requests the real fields it reads', () => {
    expect(PLACE_DETAILS_FIELDS).toContain('formatted_phone_number')
    expect(PLACE_DETAILS_FIELDS).toContain('reviews')
    expect(PLACE_DETAILS_FIELDS).toContain('serves_dinner')
  })
})
