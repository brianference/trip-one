/** Upper bound on trip length (matches the Plan page's length dropdown). */
export const MAX_TRIP_DAYS = 14

/**
 * Detects an explicit trip-length request in a chat message ("change it to 9
 * days", "make it a 5-day trip", "a week in Rome") so the assistant actually
 * re-plans for that many days instead of silently keeping the current count.
 * Returns the requested day count clamped to 1..MAX_TRIP_DAYS, or null when the
 * message isn't asking to change the length.
 *
 * Matches a number that directly modifies "day(s)" — so "9 days" / "9-day"
 * count, but "day 9" (reordering) and "2 people" do not.
 */
export function requestedDayCount(text: string): number | null {
  const lower = text.toLowerCase()
  // "9-day" (hyphenated), or a number followed by up to two adjectives then
  // "day(s)" — so "9 days" and "3 relaxed days" both count, but "day 9"
  // (reordering) and "2 people" do not.
  const digit = lower.match(/(\d{1,2})\s*-\s*days?\b/) || lower.match(/(\d{1,2})(?:\s+[a-z-]+){0,2}\s+days?\b/)
  if (digit) {
    const n = Number(digit[1])
    if (n >= 1) return Math.min(n, MAX_TRIP_DAYS)
  }
  if (/\btwo\s+weeks?\b/.test(lower)) return MAX_TRIP_DAYS
  if (/\b(a|one)\s+week\b/.test(lower)) return 7
  return null
}
