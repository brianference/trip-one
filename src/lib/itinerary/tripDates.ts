/**
 * Date helpers for a trip with an optional start date. Day 1 is the start date;
 * each later day adds a calendar day. When no start date is set, everything
 * returns null so the UI can fall back to "Day N" with no date.
 */

/** The Date for a given day number (1-based), or null if no valid start date. */
export function dateForDay(startDate: string | null | undefined, dayNumber: number): Date | null {
  if (!startDate) return null
  const d = new Date(`${startDate}T00:00:00`)
  if (Number.isNaN(d.getTime())) return null
  d.setDate(d.getDate() + (dayNumber - 1))
  return d
}

/** A short "Sat, Jul 18" label for a day number, or null if no start date. */
export function dayDateLabel(startDate: string | null | undefined, dayNumber: number): string | null {
  const d = dateForDay(startDate, dayNumber)
  return d ? d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) : null
}

/** "Day 2 · Sat, Jul 18" when a start date is set, else just "Day 2". */
export function dayHeading(startDate: string | null | undefined, dayNumber: number): string {
  const label = dayDateLabel(startDate, dayNumber)
  return label ? `Day ${dayNumber} · ${label}` : `Day ${dayNumber}`
}

/**
 * Whether the trip has ended: true from the day after its last day (start
 * date + length - 1), compared as local calendar dates. False when the start
 * date or length is missing or invalid, since then there is no end to pass.
 * @param startDate - The trip's start date (`YYYY-MM-DD`) or null
 * @param tripLengthDays - The number of days the trip runs, or null
 * @param now - The current time (a parameter so callers and tests can pin it)
 */
export function isTripOver(
  startDate: string | null | undefined,
  tripLengthDays: number | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!tripLengthDays || tripLengthDays < 1) return false
  const lastDay = dateForDay(startDate, tripLengthDays)
  if (!lastDay) return false
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return lastDay.getTime() < today.getTime()
}
