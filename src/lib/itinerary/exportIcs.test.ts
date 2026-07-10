import { describe, it, expect } from 'vitest'
import { buildIcs } from './exportIcs'
import type { ItineraryItem } from '../validation/schemas'

const NOW = new Date('2026-07-01T09:00:00')

function item(text: string, day: number, time = '', extra: Partial<ItineraryItem> = {}): ItineraryItem {
  return { text, day, time, type: 'option', ...extra } as ItineraryItem
}

describe('buildIcs', () => {
  it('returns null without a start date', () => {
    expect(buildIcs([item('Museum', 1)], null, 'Lisbon', NOW)).toBeNull()
  })

  it('returns null when there are no stops', () => {
    expect(buildIcs([], '2026-07-18', 'Lisbon', NOW)).toBeNull()
  })

  it('emits a timed event for a stop with a clock time', () => {
    const ics = buildIcs([item('Belem Tower', 1, '10:30')], '2026-07-18', 'Lisbon', NOW)!
    expect(ics).toContain('BEGIN:VCALENDAR')
    expect(ics).toContain('SUMMARY:Belem Tower')
    expect(ics).toContain('DTSTART:20260718T103000')
    expect(ics).toContain('DTEND:20260718T113000')
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true)
  })

  it('emits an all-day event for a stop without a time, on the right day', () => {
    const ics = buildIcs([item('Time Out Market', 2)], '2026-07-18', 'Lisbon', NOW)!
    // Day 2 = start + 1 = Jul 19.
    expect(ics).toContain('DTSTART;VALUE=DATE:20260719')
    expect(ics).toContain('DTEND;VALUE=DATE:20260720')
  })

  it('escapes commas and semicolons in text', () => {
    const ics = buildIcs([item('Cafe A, B; C', 1)], '2026-07-18', 'Lisbon', NOW)!
    expect(ics).toContain('SUMMARY:Cafe A\\, B\\; C')
  })

  it('uses CRLF line endings', () => {
    const ics = buildIcs([item('X', 1)], '2026-07-18', 'Lisbon', NOW)!
    expect(ics.includes('\r\n')).toBe(true)
  })
})
