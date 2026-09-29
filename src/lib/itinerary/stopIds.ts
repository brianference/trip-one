import type { ItineraryItem } from '../validation/schemas'

/**
 * Ensures every itinerary item carries a stable `id`, generating a fresh
 * uuid via `crypto.randomUUID()` (available in browsers, Cloudflare Workers,
 * and Node 20+) for any item that doesn't already have one, and leaving
 * existing ids untouched. Every entry point that introduces or mutates
 * itinerary items (the trip store's `setTrip`/`setItinerary`/`addItem`, the
 * legacy-row heal on load, and the PATCH endpoint as a server-side backstop)
 * routes through this so an id, once assigned, is stable across reorder,
 * move-to-day, organize, and dedupe — which later features (e.g. attaching
 * an uploaded photo to a specific stop) depend on.
 *
 * Returns the SAME array reference when every item already has an id, so a
 * caller that always calls this before writing to the store (e.g.
 * `setItinerary`) never triggers a re-render for a no-op pass.
 *
 * @param items - Itinerary items, some of which may be missing `id`
 * @returns `items` unchanged if every item already had an id, otherwise a
 * new array with a fresh id assigned to each item that lacked one
 */
export function ensureStopIds(items: ItineraryItem[]): ItineraryItem[] {
  if (items.every((item) => item.id != null)) return items
  return items.map((item) => (item.id != null ? item : { ...item, id: crypto.randomUUID() }))
}
