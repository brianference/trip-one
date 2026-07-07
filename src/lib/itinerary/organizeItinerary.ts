import type { ItineraryItem } from '../validation/schemas'

const FOOD_CATEGORY_PATTERN = /restaurant|cafe|food|dining/i

/**
 * True for a things-to-do category that represents a meal stop (e.g.
 * Google Places' "restaurant"/"cafe" categories) rather than a general
 * attraction. Used to recognize breakfast/lunch/dinner candidates when
 * ordering a day — never invents a category for items that don't have one.
 */
export function isFoodCategory(category: string | undefined): boolean {
  return !!category && FOOD_CATEGORY_PATTERN.test(category)
}

/**
 * Orders one day's items into a sensible flow: an identified breakfast stop
 * first (if any food-category item exists), then activities, then lunch,
 * then more activities, then dinner, with any extra food-category items
 * beyond 3 (a day rarely has more than 3 real meal stops) left in place as
 * regular activities rather than invented into a 4th/5th meal slot.
 */
function orderDay(dayItems: ItineraryItem[]): ItineraryItem[] {
  const foodItems = dayItems.filter((item) => isFoodCategory(item.category))
  const activityItems = dayItems.filter((item) => !isFoodCategory(item.category))

  // Map however many real meal stops exist onto slot positions, without
  // ever assigning the same item to two slots. 1 meal defaults to lunch (the
  // most common single tracked meal-stop on a sightseeing day); 2 defaults
  // to breakfast + dinner (lunch is often untracked/grabbed on the go);
  // 3+ is breakfast/lunch/dinner, with anything beyond the 3rd left as a
  // regular activity rather than invented into a 4th/5th meal slot.
  let breakfast: ItineraryItem | undefined
  let lunch: ItineraryItem | undefined
  let dinner: ItineraryItem | undefined
  if (foodItems.length === 1) {
    lunch = foodItems[0]
  } else if (foodItems.length === 2) {
    ;[breakfast, dinner] = foodItems
  } else if (foodItems.length >= 3) {
    ;[breakfast, lunch, dinner] = foodItems
  }
  const extraFood = foodItems.slice(3)

  const half = Math.ceil(activityItems.length / 2)
  const firstHalf = activityItems.slice(0, half)
  const secondHalf = activityItems.slice(half)

  const ordered: ItineraryItem[] = []
  if (breakfast) ordered.push(breakfast)
  ordered.push(...firstHalf)
  if (lunch) ordered.push(lunch)
  ordered.push(...secondHalf)
  if (dinner) ordered.push(dinner)
  ordered.push(...extraFood)
  return ordered
}

/**
 * Assigns each item to a day (1-indexed) and orders each day's items into a
 * sensible flow. Items with real coordinates are grouped geographically —
 * sorted by latitude and split into `tripLengthDays` contiguous chunks, a
 * simple but real clustering that keeps physically-nearby stops together
 * without fabricating any location data. Items with no coordinates (most
 * Tripadvisor-sourced suggestions, which don't include per-item lat/lng) are
 * distributed evenly across days round-robin so they aren't all dumped onto
 * day 1.
 *
 * Items that already have a `day` assigned by the user (e.g. from manually
 * dragging a stop to a different day — not yet implemented, but the field
 * supports it) are left on that day rather than being re-clustered, so a
 * recompute doesn't silently undo a deliberate placement.
 *
 * @param items - The trip's current itinerary items
 * @param tripLengthDays - How many days to spread the itinerary across (null/1 = single day)
 * @returns A new array with `day` assigned and items ordered day-by-day
 */
export function organizeItinerary(items: ItineraryItem[], tripLengthDays: number | null): ItineraryItem[] {
  const days = tripLengthDays && tripLengthDays > 1 ? tripLengthDays : 1

  if (days === 1) {
    const dayItems = items.map((item) => ({ ...item, day: 1 }))
    return orderDay(dayItems)
  }

  const manuallyAssigned = items.filter((item) => item.day != null && item.day >= 1 && item.day <= days)
  const toAssign = items.filter((item) => !manuallyAssigned.includes(item))

  const withCoords = toAssign.filter((item) => item.lat != null && item.lng != null)
  const withoutCoords = toAssign.filter((item) => item.lat == null || item.lng == null)

  // Sort geographically (by latitude) so contiguous chunks are physically
  // near each other, then split into `days` roughly-equal groups.
  const sortedByLat = [...withCoords].sort((a, b) => (a.lat as number) - (b.lat as number))
  const chunkSize = Math.ceil(sortedByLat.length / days) || 1

  const dayBuckets: ItineraryItem[][] = Array.from({ length: days }, () => [])
  for (const item of manuallyAssigned) {
    dayBuckets[(item.day as number) - 1].push(item)
  }
  sortedByLat.forEach((item, i) => {
    const dayIndex = Math.min(Math.floor(i / chunkSize), days - 1)
    dayBuckets[dayIndex].push({ ...item, day: dayIndex + 1 })
  })
  withoutCoords.forEach((item, i) => {
    const dayIndex = i % days
    dayBuckets[dayIndex].push({ ...item, day: dayIndex + 1 })
  })

  return dayBuckets.flatMap((dayItems) => orderDay(dayItems))
}
