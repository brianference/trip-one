export interface ThingToDo {
  name: string
  category: string
  source: 'tripadvisor' | 'places'
  rating?: number
  address?: string
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
