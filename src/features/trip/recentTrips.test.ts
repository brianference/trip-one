import { describe, it, expect, beforeEach } from 'vitest'
import { getRecentTrips, recordRecentTrip } from './recentTrips'

describe('recentTrips', () => {
  beforeEach(() => localStorage.clear())

  it('records trips most-recent-first and de-duplicates by id', () => {
    recordRecentTrip('a', 'Lisbon, Portugal')
    recordRecentTrip('b', 'Tokyo, Japan')
    recordRecentTrip('a', 'Lisbon, Portugal') // re-open a → moves to front
    const recents = getRecentTrips()
    expect(recents.map((t) => t.id)).toEqual(['a', 'b'])
  })

  it('caps the list at five', () => {
    for (let i = 0; i < 8; i++) recordRecentTrip(`t${i}`, `Trip ${i}`)
    expect(getRecentTrips()).toHaveLength(5)
    expect(getRecentTrips()[0].id).toBe('t7')
  })

  it('returns an empty list when nothing is stored', () => {
    expect(getRecentTrips()).toEqual([])
  })
})
