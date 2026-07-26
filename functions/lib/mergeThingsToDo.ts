export interface ThingToDo {
  name: string
  category: string
  /**
   * True when Places' full `types` marked this a drinking venue, captured
   * before food-category promotion rewrites `category` to 'restaurant'.
   */
  adultVenue?: boolean
  source: 'tripadvisor' | 'places' | 'viator'
  rating?: number
  address?: string
  /**
   * Per-item coordinates, when the upstream source provides them. Google
   * Places' Nearby Search response includes `geometry.location` per result,
   * so `places`-sourced entries get real coordinates. Tripadvisor's
   * `nearby_search` endpoint does not return per-item lat/long (only the
   * separate Location Details endpoint does, which this app doesn't call),
   * so `tripadvisor`-sourced entries omit these fields rather than
   * fabricating a value. Viator entries always carry coordinates: a product
   * whose logistics start ref cannot be resolved to lat/lng is dropped
   * entirely (the itinerary engine is coordinate-driven).
   */
  lat?: number
  lng?: number
  /**
   * Google Places place_id, when the entry came from Places. Used to fetch
   * full place details (reviews, summary, hours, a Maps link) on demand.
   * Absent for Tripadvisor and Viator entries.
   */
  placeId?: string
  /**
   * Total number of ratings/reviews the place has, when the source provides it
   * (Google's `user_ratings_total`, Tripadvisor's `num_reviews`, Viator's
   * `reviews.totalReviews`). Used to rank by popularity so an iconic
   * 50k-review attraction outranks an obscure but higher-starred cafe.
   * Absent when unknown.
   */
  numReviews?: number
  /**
   * True when this place was surfaced by web-grounded discovery or an interest
   * search (it matches the traveler's actual trip), rather than the generic
   * nearby sweep. Carried through so the planner and pool can prioritise it.
   */
  themed?: boolean
  /**
   * Viator product code (e.g. `318847P2`), when the entry came from Viator.
   * Used to re-fetch product content and as a stable identity for the booking
   * link. Absent for Places and Tripadvisor entries.
   */
  productCode?: string
  /**
   * Traveler-facing "from" per-person price, as returned by Viator
   * (`pricing.summary.fromPrice`). Never defaulted — omit when the upstream
   * response has no price. Absent for non-Viator sources.
   */
  priceFrom?: number
  /**
   * ISO currency code of {@link priceFrom} (Viator `pricing.currency`).
   * Absent when priceFrom is absent or for non-Viator sources.
   */
  currency?: string
  /**
   * Experience duration in minutes. For Viator: fixed duration when present,
   * otherwise the UPPER bound of a variable range (a day plan must budget for
   * the worst case, not the best). Absent when unknown or for sources that
   * do not supply duration.
   */
  durationMinutes?: number
  /**
   * Affiliate-tagged product URL from Viator (`productUrl`). Use as returned —
   * do not strip or rewrite pid/mcid/campaign params or commission is lost.
   * Absent for non-Viator sources.
   */
  bookingUrl?: string
  /**
   * True when Viator listed `FREE_CANCELLATION` in the product's `flags`.
   * Omitted (not set to false) when the flag is absent, so a missing field
   * never looks like a confirmed "no free cancellation".
   */
  freeCancellation?: boolean
}

/**
 * Merge Tripadvisor and Google Places results into a single deduped list.
 * Entries are considered duplicates when their names match case-insensitively;
 * the Tripadvisor entry is kept in that case.
 * @param tripadvisor - Results from the Tripadvisor content API
 * @param places - Results from the Google Places API
 * @returns Combined list with Tripadvisor entries first, then non-overlapping Places entries
 */
export function mergeThingsToDo(tripadvisor: ThingToDo[], places: ThingToDo[]): ThingToDo[] {
  const seen = new Set(tripadvisor.map((t) => t.name.toLowerCase()))
  const extra = places.filter((p) => !seen.has(p.name.toLowerCase()))
  return [...tripadvisor, ...extra]
}
