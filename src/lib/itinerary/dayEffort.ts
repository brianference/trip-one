import type { ItineraryItem } from '../validation/schemas'

// Above this total walking distance, a day is probably spread across the city.
const CROSS_TOWN_KM = 8
const WALK_KMH = 4.5 // comfortable sightseeing pace

export interface DayEffort {
  km: number
  walkMinutes: number
  crossTown: boolean
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180
}

/** Great-circle distance between two coordinates, in kilometers. */
export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

/**
 * Straight-line walking effort for a day: total distance between consecutive
 * stops that have coordinates, and a rough walking time. Returns null when
 * fewer than two stops have coordinates (nothing meaningful to measure).
 */
export function dayEffort(stops: ItineraryItem[]): DayEffort | null {
  const pts = stops.filter((s) => s.lat != null && s.lng != null).map((s) => ({ lat: s.lat as number, lng: s.lng as number }))
  if (pts.length < 2) return null
  let km = 0
  for (let i = 1; i < pts.length; i++) km += haversineKm(pts[i - 1], pts[i])
  return { km, walkMinutes: Math.round((km / WALK_KMH) * 60), crossTown: km > CROSS_TOWN_KM }
}

/** "~4.2 km · ~1 hr 20 min walking" */
export function formatEffort(e: DayEffort): string {
  const h = Math.floor(e.walkMinutes / 60)
  const m = e.walkMinutes % 60
  const time = h > 0 ? `${h} hr${m ? ` ${m} min` : ''}` : `${m} min`
  return `~${e.km.toFixed(1)} km · ~${time} walking`
}
