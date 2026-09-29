import { describe, it, expect } from 'vitest'
import { buildRecap } from './buildRecap'
import type { RecapPayload } from './types'

/** A minimal, valid recap payload a test can override fields on. */
function payload(overrides: Partial<RecapPayload> = {}): RecapPayload {
  return {
    title: 'Trip',
    displayName: 'Lisbon, Portugal',
    startDate: null,
    tripLengthDays: null,
    stops: [],
    photos: [],
    ...overrides,
  }
}

/** A stop with sane defaults, overridable per test. */
function stop(overrides: Partial<RecapPayload['stops'][number]>): RecapPayload['stops'][number] {
  return { stopId: 's1', day: 1, text: 'Stop', lat: null, lng: null, category: null, ...overrides }
}

/** A photo with sane defaults, overridable per test. */
function photo(overrides: Partial<RecapPayload['photos'][number]>): RecapPayload['photos'][number] {
  return { id: 'p1', stopId: 's1', width: 100, height: 100, createdAt: '2026-01-01T00:00:00.000Z', ...overrides }
}

describe('buildRecap', () => {
  it('groups stops by day ascending, keeping itinerary order within a day', () => {
    const recap = buildRecap(
      payload({
        stops: [
          stop({ stopId: 'b', day: 2, text: 'Day 2 first' }),
          stop({ stopId: 'a', day: 1, text: 'Day 1 first' }),
          stop({ stopId: 'c', day: 1, text: 'Day 1 second' }),
          stop({ stopId: 'd', day: 2, text: 'Day 2 second' }),
        ],
      }),
    )
    expect(recap.days.map((d) => d.day)).toEqual([1, 2])
    expect(recap.days[0].stops.map((s) => s.stopId)).toEqual(['a', 'c'])
    expect(recap.days[1].stops.map((s) => s.stopId)).toEqual(['b', 'd'])
  })

  it('numbers order 1..N across the whole trip, in day-then-itinerary order', () => {
    const recap = buildRecap(
      payload({
        stops: [
          stop({ stopId: 'b', day: 2 }),
          stop({ stopId: 'a', day: 1 }),
          stop({ stopId: 'c', day: 1 }),
          stop({ stopId: 'd', day: 2 }),
        ],
      }),
    )
    const allStops = recap.days.flatMap((d) => d.stops)
    expect(allStops.map((s) => s.stopId)).toEqual(['a', 'c', 'b', 'd'])
    expect(allStops.map((s) => s.order)).toEqual([1, 2, 3, 4])
  })

  it('flattens slides in stop order, oldest photo first within a stop', () => {
    const recap = buildRecap(
      payload({
        stops: [stop({ stopId: 's1', day: 1 }), stop({ stopId: 's2', day: 2 })],
        photos: [
          photo({ id: 'p-new', stopId: 's1', createdAt: '2026-01-02T00:00:00.000Z' }),
          photo({ id: 'p-old', stopId: 's1', createdAt: '2026-01-01T00:00:00.000Z' }),
          photo({ id: 'p-s2', stopId: 's2', createdAt: '2026-01-03T00:00:00.000Z' }),
        ],
      }),
    )
    expect(recap.slides.map((s) => s.photoId)).toEqual(['p-old', 'p-new', 'p-s2'])
    expect(recap.slides[0]).toEqual({ photoId: 'p-old', stopId: 's1', day: 1, stopText: 'Stop', stopOrder: 1 })
  })

  it('drops a photo whose stop was deleted', () => {
    const recap = buildRecap(
      payload({
        stops: [stop({ stopId: 's1', day: 1 })],
        photos: [photo({ id: 'p1', stopId: 's1' }), photo({ id: 'orphan', stopId: 'gone' })],
      }),
    )
    expect(recap.slides.map((s) => s.photoId)).toEqual(['p1'])
    expect(recap.days[0].stops[0].photos.map((p) => p.id)).toEqual(['p1'])
  })

  it('keeps stops without coordinates in days but leaves them out of route', () => {
    const recap = buildRecap(
      payload({
        stops: [
          stop({ stopId: 'has-coords', day: 1, lat: 38.7, lng: -9.1 }),
          stop({ stopId: 'no-coords', day: 1, lat: null, lng: null }),
        ],
      }),
    )
    expect(recap.days[0].stops.map((s) => s.stopId)).toEqual(['has-coords', 'no-coords'])
    expect(recap.route.map((s) => s.stopId)).toEqual(['has-coords'])
  })

  it('computes date as startDate + (day - 1), independent of local timezone', () => {
    const recap = buildRecap(
      payload({
        startDate: '2026-01-30',
        stops: [stop({ stopId: 's1', day: 1 }), stop({ stopId: 's2', day: 3 })],
      }),
    )
    expect(recap.days.map((d) => d.date)).toEqual(['2026-01-30', '2026-02-01'])
  })

  it('gives a null date for every day when there is no start date', () => {
    const recap = buildRecap(payload({ startDate: null, stops: [stop({ stopId: 's1', day: 1 })] }))
    expect(recap.days[0].date).toBeNull()
  })

  it('gives slides: [] for a trip with zero photos', () => {
    const recap = buildRecap(payload({ stops: [stop({ stopId: 's1', day: 1 })], photos: [] }))
    expect(recap.slides).toEqual([])
  })

  it('treats a missing or invalid day as day 1, matching the server default', () => {
    const recap = buildRecap(
      payload({
        stops: [
          stop({ stopId: 'zero', day: 0 }),
          stop({ stopId: 'negative', day: -1 }),
          stop({ stopId: 'fractional', day: 1.5 }),
          stop({ stopId: 'nan', day: Number.NaN }),
        ],
      }),
    )
    expect(recap.days).toHaveLength(1)
    expect(recap.days[0].day).toBe(1)
    expect(recap.days[0].stops.map((s) => s.stopId)).toEqual(['zero', 'negative', 'fractional', 'nan'])
  })
})
