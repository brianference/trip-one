import { describe, it, expect } from 'vitest'
import { requestedDayCount, MAX_TRIP_DAYS } from './requestedDays'

describe('requestedDayCount', () => {
  it('detects an explicit day count', () => {
    expect(requestedDayCount('change it to 9 days')).toBe(9)
    expect(requestedDayCount('make it a 5-day trip')).toBe(5)
    expect(requestedDayCount('3 relaxed days in Lisbon — food and history')).toBe(3)
    expect(requestedDayCount('can we do 12 days?')).toBe(12)
  })

  it('maps week phrases to day counts', () => {
    expect(requestedDayCount('a week in Rome')).toBe(7)
    expect(requestedDayCount('make it two weeks')).toBe(MAX_TRIP_DAYS)
  })

  it('clamps above the maximum', () => {
    expect(requestedDayCount('20 days please')).toBe(MAX_TRIP_DAYS)
  })

  it('ignores numbers that do not modify "day"', () => {
    expect(requestedDayCount('remove day 9')).toBeNull()
    expect(requestedDayCount('a trip for 2 people')).toBeNull()
    expect(requestedDayCount('how many days is this?')).toBeNull()
    expect(requestedDayCount('add a museum')).toBeNull()
  })
})
