export interface ThingToDo {
  name: string
  category: string
  source: 'tripadvisor' | 'places'
  rating?: number
  address?: string
  /**
   * Per-item coordinates, when the upstream source provides them. Google
   * Places' Nearby Search response includes `geometry.location` per result,
   * so `places`-sourced entries get real coordinates. Tripadvisor's
   * `nearby_search` endpoint does not return per-item lat/long (only the
   * separate Location Details endpoint does, which this app doesn't call),
   * so `tripadvisor`-sourced entries omit these fields rather than
   * fabricating a value.
   */
  lat?: number
  lng?: number
  /**
   * Google Places place_id, when the entry came from Places. Used to fetch
   * full place details (reviews, summary, hours, a Maps link) on demand.
   * Absent for Tripadvisor entries.
   */
  placeId?: string
  /**
   * Total number of ratings/reviews the place has, when the source provides it
   * (Google's `user_ratings_total`, Tripadvisor's `num_reviews`). Used to rank
   * by popularity so an iconic 50k-review attraction outranks an obscure but
   * higher-starred cafe. Absent when unknown.
   */
  numReviews?: number
  /**
   * True when this place was surfaced by web-grounded discovery or an interest
   * search (it matches the traveler's actual trip), rather than the generic
   * nearby sweep. Carried through so the planner and pool can prioritise it.
   */
  themed?: boolean
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
