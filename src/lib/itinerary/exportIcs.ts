import type { ItineraryItem } from '../validation/schemas'
import { dateForDay } from './tripDates'

/** Escapes a text value for an iCalendar property (RFC 5545 §3.3.11). */
function escapeIcs(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')
}

/** YYYYMMDD for an all-day DATE value. */
function dateStamp(d: Date): string {
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
}

/** YYYYMMDDTHHMMSS local (floating) date-time. */
function dateTimeStamp(d: Date): string {
  return `${dateStamp(d)}T${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}00`
}

/** A day after `d` (for an all-day event's non-inclusive DTEND). */
function nextDay(d: Date): Date {
  const n = new Date(d)
  n.setDate(n.getDate() + 1)
  return n
}

/** Parses "HH:MM" onto a base date; returns null if not a valid clock time. */
function withTime(base: Date, time: string | undefined): Date | null {
  const match = time?.trim().match(/^(\d{1,2}):(\d{2})$/)
  if (!match) return null
  const h = Number(match[1])
  const m = Number(match[2])
  if (h > 23 || m > 59) return null
  const d = new Date(base)
  d.setHours(h, m, 0, 0)
  return d
}

const EVENT_MINUTES = 60

/**
 * Builds an iCalendar (.ics) document for a trip's itinerary. Requires a start
 * date, since a calendar event needs a real date — Day N alone can't be placed
 * on a calendar. Stops with a clock time become one-hour timed events; stops
 * without one become all-day events on their day. Returns null when there's no
 * start date or nothing schedulable, so the caller can show a hint instead.
 *
 * @param items - The itinerary stops (each with a day and optional time)
 * @param startDate - Trip start date (YYYY-MM-DD); day 1 maps to it
 * @param destinationName - Used in the calendar name and event locations
 * @param now - Timestamp for DTSTAMP/UID (injected so callers/tests are deterministic)
 */
export function buildIcs(
  items: ItineraryItem[],
  startDate: string | null | undefined,
  destinationName: string,
  now: Date,
): string | null {
  if (!startDate || items.length === 0) return null
  const stamp = dateTimeStamp(now)
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Trip One//Trip One//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeIcs(`Trip to ${destinationName}`)}`,
  ]

  let count = 0
  items.forEach((item, index) => {
    const base = dateForDay(startDate, item.day ?? 1)
    if (!base) return
    const uid = `trip-one-${dateStamp(base)}-${index}@trip-one.pages.dev`
    lines.push('BEGIN:VEVENT', `UID:${uid}`, `DTSTAMP:${stamp}`, `SUMMARY:${escapeIcs(item.text)}`)
    const timed = withTime(base, item.time)
    if (timed) {
      const end = new Date(timed.getTime() + EVENT_MINUTES * 60 * 1000)
      lines.push(`DTSTART:${dateTimeStamp(timed)}`, `DTEND:${dateTimeStamp(end)}`)
    } else {
      lines.push(`DTSTART;VALUE=DATE:${dateStamp(base)}`, `DTEND;VALUE=DATE:${dateStamp(nextDay(base))}`)
    }
    lines.push(`LOCATION:${escapeIcs(`${item.text}, ${destinationName}`)}`, 'END:VEVENT')
    count += 1
  })

  if (count === 0) return null
  lines.push('END:VCALENDAR')
  // RFC 5545 uses CRLF line endings.
  return lines.join('\r\n') + '\r\n'
}
