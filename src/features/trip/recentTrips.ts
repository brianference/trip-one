export interface RecentTrip {
  id: string
  name: string
  ts: number
}

/**
 * Recently-viewed trips, kept in localStorage so a returning visitor can pick
 * up where they left off — retention without any account. Trips are still just
 * UUID URLs; this only remembers which ones you've opened, on this device.
 */
const KEY = 'trip-one-recents'
const MAX = 5

/** Most-recent-first list of trips this browser has opened. */
export function getRecentTrips(): RecentTrip[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((t): t is RecentTrip => t && typeof t.id === 'string' && typeof t.name === 'string')
  } catch {
    return []
  }
}

/** Record (or bump to the front) a trip the visitor opened. */
export function recordRecentTrip(id: string, name: string): void {
  try {
    const existing = getRecentTrips().filter((t) => t.id !== id)
    const next = [{ id, name, ts: Date.now() }, ...existing].slice(0, MAX)
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    // Ignore storage failures — recents are a convenience, not essential.
  }
}
