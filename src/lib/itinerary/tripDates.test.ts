import { describe, it, expect } from 'vitest'
import { dateForDay, dayDateLabel, dayHeading } from './tripDates'

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
})
