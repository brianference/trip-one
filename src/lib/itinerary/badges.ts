import type { ItineraryItem } from '../validation/schemas'

export interface ItineraryBadge {
  label: string
  tone: 'booked' | 'transit' | 'optional' | 'dinner'
}

/**
 * Picks a contextual badge for an itinerary item from its type and text,
 * mirroring the real badge system shipped in yellowstone-one's Itinerary
 * component: a dinner-text match takes priority, then fixed/travel/option
 * map to Booked/Transit/Optional.
 */
export function badgeFor(item: Pick<ItineraryItem, 'type' | 'text'>): ItineraryBadge {
  if (/dinner/i.test(item.text)) return { label: 'Dinner', tone: 'dinner' }
  if (item.type === 'fixed') return { label: 'Booked', tone: 'booked' }
  if (item.type === 'option') return { label: 'Optional', tone: 'optional' }
  return { label: 'Transit', tone: 'transit' }
}

/**
 * Builds a real Google Maps directions URL to a destination, using the
 * item's `q` search text (or its display text as a fallback) — the same
 * pattern used throughout this app for "Transit directions" links. Opens in
 * a new tab; never fetches anything itself, so it needs no API key.
 */
export function directionsUrl(destination: string): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`
}
