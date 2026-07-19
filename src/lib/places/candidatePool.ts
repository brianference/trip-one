import { isFoodCategory } from './foodCategories'
import { byPopularity } from './popularity'
import { fitsAudience } from './audience'

/**
 * Builds the candidate pool the grounded planner chooses from.
 *
 * The planner can only ever be as good as this list: it selects by index into
 * it and cannot invent a place. So if the pool is mostly restaurants, the
 * itinerary is mostly restaurants, no matter what the traveler asked for.
 *
 * Sorting every nearby place by rating and taking the top 40 did exactly that.
 * The fixed nearby search returns roughly equal counts of attractions,
 * restaurants and cafes, and food outscores sightseeing almost everywhere — a
 * good local cafe is a 4.7 while a trailhead or a boat launch is unrated — so
 * food won the sort and filled most of the pool. In a small town, where
 * `tourist_attraction` returns only a handful of hits, it filled nearly all of
 * it.
 *
 * The pool is therefore built by ROLE, not by one global sort:
 *   1. themed  — real places found by searching the traveler's own interests
 *   2. general — everything else that isn't food (attractions, parks, museums)
 *   3. food    — capped, because a traveler needs a few meals, not thirty
 *
 * Food the traveler explicitly asked for arrives as `themed` (a winery search
 * on a wine trip, a food-tour search on a food trip) and is exempt from the
 * cap. The cap only ever suppresses INCIDENTAL food — which is what made every
 * trip look like a restaurant tour.
 */

/** Baseline pool size; the real cap scales up with trip length (see {@link poolSizeForDays}). */
export const MAX_CANDIDATES = 40
/** Hard ceiling regardless of trip length, to keep the plan prompt affordable. */
export const MAX_CANDIDATES_CAP = 110
/** Generic food candidates offered per trip day — enough to pick real meals from. */
export const FOOD_CANDIDATES_PER_DAY = 3

/**
 * Pool size for a trip of `days` days. A long trip needs more real candidates
 * to fill every day — a 12-day trip built from a 40-place pool ran dry at day
 * 7. Roughly 6 candidates per day (attractions + meals), floored at the
 * baseline and capped so the prompt stays affordable.
 */
export function poolSizeForDays(days: number): number {
  return Math.min(MAX_CANDIDATES_CAP, Math.max(MAX_CANDIDATES, Math.max(1, days) * 6))
}

/** The shape the pool needs; structural so both ThingToDo definitions satisfy it. */
export interface PoolPlace {
  name: string
  category: string
  /** Set when Places' full `types` marked this a drinking venue. */
  adultVenue?: boolean
  /** Full Places `types`, when the source kept them. */
  types?: readonly string[]
  rating?: number
  numReviews?: number
  themed?: boolean
}

export interface PoolOptions {
  /** Pool size cap (defaults to {@link MAX_CANDIDATES}). */
  maxCandidates?: number
  /**
   * True when eating and drinking are a main point of the trip. Food then
   * counts as on-theme: it's exempt from the per-day cap and gets first claim
   * on the pool, exactly like any other interest.
   *
   * Without this, the caps that stop an ordinary trip becoming a restaurant
   * tour also gutted the trips that were SUPPOSED to be one — a New Orleans
   * "eat everything" request came back with two stops.
   */
  foodFocused?: boolean
  /**
   * Audience filter for the GENERIC nearby pool. The deterministic day-filler
   * draws from this pool once the themed venues run out, and it bypasses the
   * planner's own audience rule — which is how a zoo ended up on day 12 of a
   * 21st-birthday pub trip. Filtering here keeps kid attractions out of an
   * adults trip and nightlife out of a kids trip, at the source.
   */
  audience?: 'kids' | 'adults' | 'general'
}

// Audience classification lives in ./audience, which judges from the full
// Places `types` and the venue name rather than the single promoted category.
// Category alone missed saloons: food promotion rewrites a bar's category to
// 'restaurant', which is how the Mangy Moose reached a family ski trip.


/**
 * Merges the fixed nearby pool with interest-driven results and selects a
 * balanced, deduped candidate list.
 *
 * @param nearby - The cached nearby pool (attractions, restaurants, cafes)
 * @param themed - Real places found by searching the traveler's interests
 * @param days - Trip length, which sets how many meals need covering
 * @param opts - See {@link PoolOptions}
 * @returns Candidates ordered themed-first, each marked with `themed`
 */
export function buildCandidatePool<T extends PoolPlace>(
  nearby: T[],
  themed: T[],
  days: number,
  opts: PoolOptions = {},
): T[] {
  const { maxCandidates = poolSizeForDays(days), foodFocused = false, audience = 'general' } = opts
  // Drop audience-mismatched places up front so nothing downstream — including
  // the deterministic day-filler — can schedule them. Themed venues are
  // filtered too: the discovery prompt is told to respect the audience, but a
  // prompt is a request, not a guarantee, and a saloon reached day 4 of a
  // family ski trip that way.
  nearby = nearby.filter((p) => fitsAudience(p, audience))
  themed = themed.filter((p) => fitsAudience(p, audience))
  const seen = new Set<string>()
  const take = (item: T, isThemed: boolean): T | null => {
    const key = item.name.trim().toLowerCase()
    if (key === '' || seen.has(key)) return null
    seen.add(key)
    return { ...item, themed: isThemed }
  }

  // Themed places are the reason the traveler is going; they get first claim
  // on the pool and are never dropped for a higher-rated cafe.
  const themedPicks: T[] = []
  for (const item of [...themed].sort(byPopularity)) {
    const candidate = take(item, true)
    if (candidate) themedPicks.push(candidate)
  }

  const generalPicks: T[] = []
  const foodPicks: T[] = []
  const foodBudget = Math.max(1, days) * FOOD_CANDIDATES_PER_DAY
  for (const item of [...nearby].sort(byPopularity)) {
    const isFood = isFoodCategory(item.category)
    // On a food trip the restaurants ARE the attractions: promote them to
    // themed so they skip the cap and reach the planner as the point of the
    // trip rather than as filler to be trimmed.
    if (isFood && foodFocused) {
      const candidate = take(item, true)
      if (candidate) themedPicks.push(candidate)
      continue
    }
    if (isFood && foodPicks.length >= foodBudget) continue
    const candidate = take(item, false)
    if (!candidate) continue
    if (isFood) foodPicks.push(candidate)
    else generalPicks.push(candidate)
  }

  // Food keeps a reserved allocation rather than simply sorting last: a
  // truncating slice over "themed, general, food" would starve a popular
  // destination's plan of every meal option the moment themed + general filled
  // the cap. Reserve what food actually needs, let themed and general share the
  // rest, and hand any unclaimed reservation back to them.
  const foodSlots = Math.min(foodPicks.length, foodBudget, Math.floor(maxCandidates / 2))
  const primary = [...themedPicks, ...generalPicks].slice(0, maxCandidates - foodSlots)
  return [...primary, ...foodPicks.slice(0, maxCandidates - primary.length)]
}
