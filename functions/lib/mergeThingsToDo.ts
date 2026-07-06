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
