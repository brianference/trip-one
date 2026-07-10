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
