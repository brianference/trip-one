import { describe, it, expect } from 'vitest'
import {
  selectMapMarkers,
  MIN_RATING,
  MIN_REVIEWS,
  MAX_MAP_PINS,
  RESTAURANT_NEAR_DAY_KM,
} from './selectMapMarkers'
import type { ThingToDo } from '../../lib/api/client'
import type { ItineraryItem } from '../../lib/validation/schemas'

function place(partial: Partial<ThingToDo> & Pick<ThingToDo, 'name' | 'category'>): ThingToDo {
  return {
    source: 'places',
    lat: 41.15,
    lng: -8.61,
    rating: 4.6,
    numReviews: 200,
    ...partial,
  }
}

describe('selectMapMarkers', () => {
  it('exports thresholds derived from measured data (not magic numbers)', () => {
    expect(MIN_RATING).toBe(4.0)
    expect(MIN_REVIEWS).toBe(50)
    expect(MAX_MAP_PINS).toBe(24)
    expect(RESTAURANT_NEAR_DAY_KM).toBe(1.5)
  })

  it('never plots an entry without coordinates', () => {
    const markers = selectMapMarkers({
      thingsToDo: [place({ name: 'No Coords', category: 'tourist_attraction', lat: undefined, lng: undefined })],
      itinerary: [],
      selectedDay: 1,
    })
    expect(markers).toEqual([])
  })

  it('always plots itinerary stops even when they fail the quality bar', () => {
    const itinerary: ItineraryItem[] = [
      { time: '', text: 'PadToGo', type: 'option', day: 1, lat: 41.15, lng: -8.61, category: 'attraction' },
    ]
    const markers = selectMapMarkers({
      thingsToDo: [
        place({ name: 'Junk Building', category: 'tourist_attraction', rating: 3.2, numReviews: 2 }),
      ],
      itinerary,
      selectedDay: 1,
    })
    expect(markers.some((m) => m.label === 'PadToGo')).toBe(true)
    expect(markers.some((m) => m.label === 'Junk Building')).toBe(false)
  })

  it('drops unrated and low-review attractions', () => {
    const markers = selectMapMarkers({
      thingsToDo: [
        place({ name: 'Unrated', category: 'tourist_attraction', rating: undefined, numReviews: 500 }),
        place({ name: 'Low reviews', category: 'tourist_attraction', rating: 4.8, numReviews: 10 }),
        place({ name: 'Low rating', category: 'tourist_attraction', rating: 3.5, numReviews: 5000 }),
        place({ name: 'Quality Sight', category: 'tourist_attraction', rating: 4.6, numReviews: 5000 }),
      ],
      itinerary: [],
      selectedDay: 1,
    })
    expect(markers.map((m) => m.label)).toEqual(['Quality Sight'])
  })

  it('prefers themed places even without meeting the review floor', () => {
    const markers = selectMapMarkers({
      thingsToDo: [
        place({ name: 'Themed Spot', category: 'tourist_attraction', themed: true, rating: undefined, numReviews: undefined }),
        place({ name: 'Quality Sight', category: 'tourist_attraction', rating: 4.6, numReviews: 5000 }),
      ],
      itinerary: [],
      selectedDay: 1,
    })
    expect(markers[0]?.label).toBe('Themed Spot')
    expect(markers.map((m) => m.label)).toContain('Quality Sight')
  })

  it('includes quality restaurants only near the selected day stops', () => {
    const dayStop: ItineraryItem = {
      time: '',
      text: 'Cathedral',
      type: 'option',
      day: 1,
      lat: 41.15,
      lng: -8.61,
      category: 'tourist_attraction',
    }
    const near = place({
      name: 'Near Bistro',
      category: 'restaurant',
      rating: 4.5,
      numReviews: 300,
      lat: 41.1505,
      lng: -8.6105,
    })
    // ~5km east — outside RESTAURANT_NEAR_DAY_KM
    const far = place({
      name: 'Far Bistro',
      category: 'restaurant',
      rating: 4.7,
      numReviews: 800,
      lat: 41.15,
      lng: -8.55,
    })
    const markers = selectMapMarkers({
      thingsToDo: [near, far],
      itinerary: [dayStop],
      selectedDay: 1,
    })
    const labels = markers.map((m) => m.label)
    expect(labels).toContain('Near Bistro')
    expect(labels).not.toContain('Far Bistro')
  })

  it('does not plot restaurants when the selected day has no coordinate stops', () => {
    const markers = selectMapMarkers({
      thingsToDo: [place({ name: 'City Restaurant', category: 'restaurant', rating: 4.7, numReviews: 900 })],
      itinerary: [],
      selectedDay: 1,
    })
    expect(markers).toEqual([])
  })

  it('caps total pins at MAX_MAP_PINS while keeping itinerary stops', () => {
    const itinerary: ItineraryItem[] = [
      { time: '', text: 'Stop A', type: 'option', day: 1, lat: 41.15, lng: -8.61 },
      { time: '', text: 'Stop B', type: 'option', day: 1, lat: 41.151, lng: -8.611 },
    ]
    const many = Array.from({ length: 40 }, (_, i) =>
      place({
        name: `Sight ${i}`,
        category: 'tourist_attraction',
        rating: 4.8,
        numReviews: 1000 + i,
        lat: 41.15 + i * 0.001,
        lng: -8.61,
      }),
    )
    const markers = selectMapMarkers({ thingsToDo: many, itinerary, selectedDay: 1 })
    expect(markers.length).toBeLessThanOrEqual(MAX_MAP_PINS)
    expect(markers.some((m) => m.label === 'Stop A')).toBe(true)
    expect(markers.some((m) => m.label === 'Stop B')).toBe(true)
  })

  it('preserves placeId on quality pins so resolvable markers open full detail', () => {
    const markers = selectMapMarkers({
      thingsToDo: [
        place({
          name: 'Clerigos',
          category: 'tourist_attraction',
          placeId: 'ChIJabc',
          rating: 4.6,
          numReviews: 12000,
        }),
      ],
      itinerary: [],
      selectedDay: 1,
    })
    expect(markers[0]).toMatchObject({ label: 'Clerigos', placeId: 'ChIJabc' })
  })
})
