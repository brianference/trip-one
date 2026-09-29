import { describe, it, expect } from 'vitest'
import { dateForDay, dayDateLabel, dayHeading, isTripOver } from './tripDates'

describe('tripDates', () => {
  it('dateForDay adds calendar days from the start', () => {
    expect(dateForDay('2026-07-18', 1)?.toISOString().slice(0, 10)).toBe('2026-07-18')
    expect(dateForDay('2026-07-18', 3)?.toISOString().slice(0, 10)).toBe('2026-07-20')
  })

  it('returns null when there is no start date', () => {
    expect(dateForDay(null, 2)).toBeNull()
    expect(dayDateLabel(undefined, 2)).toBeNull()
  })

  it('dayHeading includes the date only when a start date is set', () => {
    expect(dayHeading(null, 2)).toBe('Day 2')
    expect(dayHeading('2026-07-18', 2)).toMatch(/^Day 2 · /)
  })

  it('isTripOver is true from the day after the last trip day, never on it', () => {
    // A 3-day trip starting Sep 1 runs Sep 1-3.
    expect(isTripOver('2026-09-01', 3, new Date(2026, 8, 3, 23, 59))).toBe(false)
    expect(isTripOver('2026-09-01', 3, new Date(2026, 8, 4, 0, 1))).toBe(true)
    expect(isTripOver('2026-09-01', 3, new Date(2026, 7, 20))).toBe(false)
  })

  it('isTripOver is false when the start date or length is missing or invalid', () => {
    const later = new Date(2030, 0, 1)
    expect(isTripOver(null, 3, later)).toBe(false)
    expect(isTripOver('2026-09-01', null, later)).toBe(false)
    expect(isTripOver('2026-09-01', 0, later)).toBe(false)
    expect(isTripOver('not-a-date', 3, later)).toBe(false)
  })
})
