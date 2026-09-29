import type { ItineraryItem } from '../validation/schemas'
import { normalizeStopName } from './dedupeItinerary'

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

/**
 * Finds an unclaimed item in `previous` that represents the same real-world
 * place as `item`: by `placeId` when both have one, otherwise by
 * `normalizeStopName(text)`. `ItineraryItem` doesn't declare `placeId` today,
 * so the placeId branch is a forward-compatible no-op until a caller starts
 * setting it — the cast mirrors the same optional-field pattern
 * `dedupeItinerary`'s `PlaceLike` already uses.
 */
function findCarryOverMatch(
  item: ItineraryItem,
  previous: ItineraryItem[],
  claimed: Set<ItineraryItem>,
): ItineraryItem | undefined {
  const itemPlaceId = (item as { placeId?: string }).placeId
  if (itemPlaceId) {
    const byPlaceId = previous.find(
      (p) => !claimed.has(p) && (p as { placeId?: string }).placeId === itemPlaceId,
    )
    if (byPlaceId) return byPlaceId
  }
  const nameKey = normalizeStopName(item.text)
  return previous.find((p) => !claimed.has(p) && normalizeStopName(p.text) === nameKey)
}

/**
 * Carries a stop's stable `id` forward onto its replacement when a chat plan
 * revision rebuilds itinerary items from scratch.
 *
 * WHY this exists: `applyPlan` rebuilds every mentioned day's items via
 * `planToItinerary`, which only knows real places (name/coords/category) —
 * it never sets `id`, because it has no notion of "this is the same stop as
 * before." Without this carry-over, a revision like "add a food stop on day
 * 2" would drop every day-2 stop (`mergePreservingUnmentionedDays`) and
 * rebuild them id-less, so `ensureStopIds` would mint a brand-new id for
 * every stop the traveler never actually asked to remove — silently
 * detaching any photo already attached to it.
 *
 * Matches each `next` item to at most one unclaimed `previous` item (by
 * `placeId` when both have one, otherwise by normalized name) and copies
 * that item's `id` over. Each `previous` item can be claimed once, so two
 * `next` items that happen to share a name never both inherit the same id —
 * only the first (in `next`'s order) does; a later same-name item is treated
 * as new and gets its own id from `ensureStopIds` downstream. Items with no
 * match are returned unchanged.
 *
 * Pure: no network, no store, no side effects.
 *
 * @param previous - The itinerary before the revision (ids already assigned)
 * @param next - The revision's items, typically freshly built and id-less
 * @returns `next`, with each matched item's `id` copied over from `previous`
 */
export function carryOverStopIds(previous: ItineraryItem[], next: ItineraryItem[]): ItineraryItem[] {
  const claimed = new Set<ItineraryItem>()
  return next.map((item) => {
    const match = findCarryOverMatch(item, previous, claimed)
    if (!match?.id) return item
    claimed.add(match)
    return { ...item, id: match.id }
  })
}
