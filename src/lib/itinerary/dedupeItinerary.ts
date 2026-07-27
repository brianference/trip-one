import type { ItineraryItem } from '../validation/schemas'

/**
 * Normalizes a stop name for identity comparison: trim + lowercase.
 * Exact match only — not fuzzy — so near-names stay distinct.
 * @param name - Raw stop text or place name
 */
export function normalizeStopName(name: string): string {
  return name.trim().toLowerCase()
}

/**
 * Optional place identity fields some stop-like rows carry (ThingsToDo have
 * placeId; itinerary items may when carried through from Places).
 */
type PlaceLike = {
  text?: string
  name?: string
  placeId?: string
}

/**
 * True when `item` is the same place as one already seen, by normalized name
 * or by placeId.
 * @param item - Candidate stop or suggestion
 * @param nameOf - Extracts the display name used for matching
 * @param seenNames - Normalized names kept so far
 * @param seenPlaceIds - Non-empty placeIds kept so far
 */
function isDuplicatePlace(
  item: PlaceLike,
  nameOf: (item: PlaceLike) => string,
  seenNames: Set<string>,
  seenPlaceIds: Set<string>,
): boolean {
  const placeId = item.placeId?.trim()
  if (placeId && seenPlaceIds.has(placeId)) return true
  const nameKey = normalizeStopName(nameOf(item))
  if (nameKey !== '' && seenNames.has(nameKey)) return true
  return false
}

/**
 * Records identity keys for a kept place so later matches can be dropped.
 */
function rememberPlace(
  item: PlaceLike,
  nameOf: (item: PlaceLike) => string,
  seenNames: Set<string>,
  seenPlaceIds: Set<string>,
): void {
  const placeId = item.placeId?.trim()
  if (placeId) seenPlaceIds.add(placeId)
  const nameKey = normalizeStopName(nameOf(item))
  if (nameKey !== '') seenNames.add(nameKey)
}

/**
 * Removes duplicate itinerary stops, keeping the **first** occurrence and its
 * day/time assignment. Never silently moves a stop to another day.
 *
 * WHY this exists: the live Tokyo demo trip
 * (`00000000-0000-4000-8000-000000000002`) drifted to 25 stops with three
 * exact duplicate pairs — "Odaiba Beach" ×2, "Odaiba Marine Park" ×2,
 * "Isshiki Beach" ×2 — while `src/data/demo-tokyo.ts` has only 6 unique
 * stops. Growth/add paths filtered new candidates against existing names but
 * never deduped within a candidate list or on merge/plan write, so the same
 * place could land twice. Matching is exact normalized name (trim+lowercase)
 * or a matching placeId.
 *
 * Judgement on deliberate re-adds: a traveler who intentionally puts the
 * same place on two days is an edge case. We only drop exact normalized-name
 * (or placeId) matches — not fuzzy near-duplicates — and accept that a true
 * intentional repeat of the exact same name is removed. That is safer than
 * letting write paths reintroduce the Tokyo-style drift.
 *
 * Pure: no network, no store, no side effects.
 *
 * @param items - Itinerary in current order
 * @returns A new array with duplicates removed; first occurrence wins
 */
export function dedupeItinerary(items: ItineraryItem[]): ItineraryItem[] {
  const seenNames = new Set<string>()
  const seenPlaceIds = new Set<string>()
  const nameOf = (item: PlaceLike) => item.text ?? ''
  const out: ItineraryItem[] = []
  for (const item of items) {
    if (isDuplicatePlace(item as PlaceLike, nameOf, seenNames, seenPlaceIds)) continue
    rememberPlace(item as PlaceLike, nameOf, seenNames, seenPlaceIds)
    out.push(item)
  }
  return out
}

/**
 * Removes duplicate place suggestions (e.g. ThingsToDo candidate lists) by the
 * same identity rules as {@link dedupeItinerary}. First occurrence wins.
 *
 * Used before selecting growth candidates so two identically-named suggestions
 * cannot both be added when growing a trip.
 *
 * @param places - Candidate places with a `name` field
 * @returns Deduped list preserving original order of first hits
 */
export function dedupePlaceSuggestions<T extends { name: string; placeId?: string }>(places: T[]): T[] {
  const seenNames = new Set<string>()
  const seenPlaceIds = new Set<string>()
  const nameOf = (item: PlaceLike) => item.name ?? ''
  const out: T[] = []
  for (const place of places) {
    if (isDuplicatePlace(place, nameOf, seenNames, seenPlaceIds)) continue
    rememberPlace(place, nameOf, seenNames, seenPlaceIds)
    out.push(place)
  }
  return out
}
