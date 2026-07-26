/**
 * Duration-aware day capacity for itinerary planning.
 *
 * Nothing in the planner used to reason about how long a stop takes. A
 * 720-minute Yellowstone day tour was scheduled as one ordinary stop, and
 * balanceDayFood then stacked three restaurants onto the same day — a
 * plausible-looking, physically impossible itinerary. These helpers encode
 * the real time budget so food and attraction padding cannot override it.
 *
 * Stops with UNKNOWN duration must behave exactly as today: never assume a
 * default duration. Only a known {@link FULL_DAY_MINUTES} / {@link HALF_DAY_MINUTES}
 * experience tightens the day.
 */

/** A full-day experience fills the day (≥ this many minutes). */
export const FULL_DAY_MINUTES = 360
/** A half-day experience leaves room for at most one more attraction. */
export const HALF_DAY_MINUTES = 240

/**
 * Minimum fields the capacity rules need. Pure and structural so both
 * PlanCandidate and itinerary-shaped objects satisfy it.
 */
export interface CapacityStop {
  /**
   * Known duration in minutes. Absent means unknown — never defaulted.
   * Full/half-day rules only fire when this is a finite number.
   */
  durationMinutes?: number
  /**
   * True for a bookable experience (Viator product), not a free POI.
   * Food tours still count as experiences, never as the food budget.
   */
  isExperience?: boolean
  /** True when this stop is a meal/cafe/bar (food budget, not an attraction). */
  isFood?: boolean
}

/** How tightly an experience fills a day, from known duration only. */
export type DayDurationClass = 'full' | 'half' | 'normal'

/**
 * Classifies a single known duration. Returns `normal` when duration is
 * unknown or below the half-day threshold — callers must not invent a default.
 *
 * @param durationMinutes - Real minutes, or undefined when unknown
 */
export function durationClass(durationMinutes: number | undefined): DayDurationClass {
  if (durationMinutes == null || !Number.isFinite(durationMinutes) || durationMinutes <= 0) {
    return 'normal'
  }
  if (durationMinutes >= FULL_DAY_MINUTES) return 'full'
  if (durationMinutes >= HALF_DAY_MINUTES) return 'half'
  return 'normal'
}

/**
 * Strongest duration class among EXPERIENCE stops with a known duration.
 * Non-experience stops and unknown durations do not tighten the day.
 *
 * @param stops - The day's stops (any order)
 */
export function dayDurationClass(stops: readonly CapacityStop[]): DayDurationClass {
  let best: DayDurationClass = 'normal'
  for (const stop of stops) {
    if (!stop.isExperience) continue
    const cls = durationClass(stop.durationMinutes)
    if (cls === 'full') return 'full'
    if (cls === 'half') best = 'half'
  }
  return best
}

/**
 * How many non-experience attractions may share a day with the day's
 * experience(s). `null` means unlimited (today's behaviour).
 *
 * - full-day experience → 0 other attractions
 * - half-day experience → at most 1 other attraction
 * - no/unknown duration experience → unlimited
 *
 * @param stops - The day's stops
 */
export function maxAdditionalAttractions(stops: readonly CapacityStop[]): number | null {
  const cls = dayDurationClass(stops)
  if (cls === 'full') return 0
  if (cls === 'half') return 1
  return null
}

/**
 * Hard food cap for a day that already holds a full-day experience.
 * Returns `null` when the normal food floor/ceiling apply unchanged.
 * A full-day tour usually includes or displaces meals — at most 1 food stop.
 *
 * @param stops - The day's stops
 */
export function maxFoodForDay(stops: readonly CapacityStop[]): number | null {
  return dayDurationClass(stops) === 'full' ? 1 : null
}

/**
 * Floor for food stops on a day, never above the capacity ceiling when one
 * applies. Without a capacity cap this is just `defaultMin`.
 *
 * @param stops - The day's stops
 * @param defaultMin - Planner default (e.g. MIN_FOOD_PER_DAY)
 */
export function foodFloorForDay(stops: readonly CapacityStop[], defaultMin: number): number {
  const cap = maxFoodForDay(stops)
  if (cap == null) return defaultMin
  return Math.min(defaultMin, cap)
}

/**
 * Ceiling for food stops on a day: capacity cap when present, else the
 * planner's default ceiling.
 *
 * @param stops - The day's stops
 * @param defaultMax - Planner default incidental/total food ceiling
 */
export function foodCeilingForDay(stops: readonly CapacityStop[], defaultMax: number): number {
  const cap = maxFoodForDay(stops)
  if (cap == null) return defaultMax
  return Math.min(defaultMax, cap)
}

/**
 * Whether a candidate is a bookable experience. Prefer the explicit flag;
 * fall back to `source === 'viator'` so ThingToDo rows work without remapping.
 *
 * @param candidate - Plan or pool place shape
 */
export function isExperiencePlace(candidate: {
  isExperience?: boolean
  source?: string
}): boolean {
  if (candidate.isExperience === true) return true
  return candidate.source === 'viator'
}

/**
 * Enforces day capacity on a list of stop indices into `candidates`:
 * - at most one experience per day (first wins)
 * - full-day experience → drop other non-food attractions
 * - half-day experience → keep at most one other non-food attraction
 * - food is left as-is here; callers apply food floor/ceiling separately
 *
 * Unknown-duration experiences do not trim attractions (today's behaviour).
 *
 * WHY: a 720-minute Yellowstone tour pinned ~110 km from Jackson Hole is a
 * legitimate day trip, but latitude day-clustering would otherwise merge
 * distant POIs onto the same day. Isolating the full-day experience keeps
 * that far pin from distorting the rest of the itinerary.
 *
 * @param placeIndexes - Indices into `candidates` for one day
 * @param candidates - Real candidates with duration / experience flags
 * @param isFood - Predicate for food categories (injected to avoid circular deps)
 * @returns A new index list respecting capacity; order of kept stops preserved
 */
export function enforceAttractionCapacity(
  placeIndexes: readonly number[],
  candidates: readonly {
    durationMinutes?: number
    isExperience?: boolean
    source?: string
    category?: string
  }[],
  isFood: (category: string | undefined) => boolean,
): number[] {
  const asStops = (indexes: readonly number[]): CapacityStop[] =>
    indexes.map((i) => {
      const c = candidates[i]
      return {
        durationMinutes: c?.durationMinutes,
        isExperience: c ? isExperiencePlace(c) : false,
        isFood: isFood(c?.category),
      }
    })

  // First pass: at most one experience (first occurrence wins).
  let experienceSeen = false
  const oneExperience = placeIndexes.filter((i) => {
    const c = candidates[i]
    if (!c || !isExperiencePlace(c)) return true
    if (experienceSeen) return false
    experienceSeen = true
    return true
  })

  const stops = asStops(oneExperience)
  const maxExtra = maxAdditionalAttractions(stops)
  if (maxExtra == null) return oneExperience

  // Keep the experience(s) and food; cap other attractions.
  let extraAttractions = 0
  return oneExperience.filter((i) => {
    const c = candidates[i]
    if (!c) return false
    if (isExperiencePlace(c)) return true
    if (isFood(c.category)) return true
    if (extraAttractions < maxExtra) {
      extraAttractions += 1
      return true
    }
    return false
  })
}

/**
 * Formats a real duration in plain language without rounding up into a claim.
 * 200 minutes is "about 3 hours 20 minutes", never "about 4 hours".
 *
 * @param minutes - Real duration in minutes (must be positive)
 */
export function formatDurationMinutes(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return ''
  const whole = Math.floor(minutes)
  if (whole < 60) {
    return `about ${whole} minute${whole === 1 ? '' : 's'}`
  }
  const hours = Math.floor(whole / 60)
  const mins = whole % 60
  if (mins === 0) {
    return `about ${hours} hour${hours === 1 ? '' : 's'}`
  }
  return `about ${hours} hour${hours === 1 ? '' : 's'} ${mins} minute${mins === 1 ? '' : 's'}`
}
