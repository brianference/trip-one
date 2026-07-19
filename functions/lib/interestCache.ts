/**
 * Cache key for an interest-driven place search.
 *
 * The interest search is the most expensive step of building a trip — one AI
 * call plus up to six paid Google Places calls. But popular destinations get
 * requested over and over ("3 days in Paris", "Vegas weekend"), and the same
 * interest phrasing recurs, so the result is highly cacheable. This derives a
 * stable key from the destination and the interests so repeat trips reuse the
 * stored result instead of paying again.
 */

/**
 * Normalizes the interests phrase to the part that changes the RESULT, so
 * trivially different wording ("walleye fishing, ruffed grouse hunting" vs
 * "walleye fishing and ruffed grouse hunting  ") hits the same cache entry.
 * Lowercases, strips light punctuation, collapses whitespace, and bounds the
 * length.
 */
export function normalizeInterestsForKey(interests: string): string {
  return interests
    .toLowerCase()
    .replace(/[.,;:!?"']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200)
}

/**
 * Builds the cache key for a destination + interests pair: the destination
 * slug and a SHA-256 of the normalized interests, so the key is bounded in
 * length and safe to put in a URL filter. Two trips to the same place with the
 * same interests share a key; a different destination or different interests
 * gets its own.
 *
 * @param slug - The destination's normalized location slug (already stable)
 * @param interests - The traveler's interests phrase
 */
/**
 * Bump when the SHAPE or CLASSIFICATION of cached places changes, not when the
 * search itself changes. Cached entries store derived metadata (`adultVenue`,
 * `category`), so a change to how places are classified leaves every existing
 * entry stale — a family trip kept getting saloons back from cache long after
 * the filter that excludes them was fixed. Bumping this retires those entries.
 */
export const PLACE_CACHE_VERSION = 'v2-audience'

export async function buildInterestCacheKey(slug: string, interests: string): Promise<string> {
  const data = new TextEncoder().encode(normalizeInterestsForKey(interests))
  const digest = await crypto.subtle.digest('SHA-256', data)
  const hex = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
  return `${slug}:${hex}`
}
