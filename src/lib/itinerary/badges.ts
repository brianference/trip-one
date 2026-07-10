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

const MEAL_CATEGORIES = new Set(['restaurant', 'food', 'meal_takeaway', 'meal_delivery'])
const BREAK_CATEGORIES = new Set(['cafe', 'bar', 'bakery'])
const TRANSIT_CATEGORIES = new Set(['transit_station', 'bus_station', 'train_station', 'subway_station', 'airport', 'light_rail_station'])

/**
 * A user-meaningful ROLE for a stop — Attraction, Meal, Break, or Transit —
 * derived from its real category (and type). This replaces the internal
 * fixed/travel/option badges, which meant nothing to a traveler.
 */
export function roleFor(item: Pick<ItineraryItem, 'type' | 'text' | 'category'>): ItineraryBadge {
  const category = item.category ?? ''
  if (MEAL_CATEGORIES.has(category) || /breakfast|lunch|dinner/i.test(item.text)) return { label: 'Meal', tone: 'dinner' }
  if (BREAK_CATEGORIES.has(category) || /coffee|cafe|drinks?/i.test(item.text)) return { label: 'Break', tone: 'optional' }
  if (item.type === 'travel' || TRANSIT_CATEGORIES.has(category)) return { label: 'Transit', tone: 'transit' }
  return { label: 'Attraction', tone: 'booked' }
}

const SLOTS = ['Morning', 'Midday', 'Afternoon', 'Evening'] as const

/**
 * A soft time-of-day label for a stop that has no clock time, based on its
 * position within the day — so a stop always shows *something* ("Morning",
 * "Evening") instead of a blank time column.
 * @param position - 0-based index of the stop within its day
 * @param total - number of stops that day
 */
export function slotLabel(position: number, total: number): string {
  if (total <= 1) return SLOTS[0]
  const fraction = position / (total - 1)
  return SLOTS[Math.min(SLOTS.length - 1, Math.floor(fraction * SLOTS.length))]
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
