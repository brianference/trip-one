// Food-serving Google Places categories. Shared by the Pages Functions (the
// planner's food balancing) and the client (candidate-pool assembly), so both
// sides agree on what counts as "a place to eat" — a disagreement there would
// silently break the food caps.
const FOOD_CATEGORIES = new Set([
  'restaurant',
  'cafe',
  'bar',
  'bakery',
  'food',
  'meal_takeaway',
  'meal_delivery',
])

/** True when a category is a food/drink venue (restaurant, cafe, bar, bakery, …). */
export function isFoodCategory(category?: string): boolean {
  return category != null && FOOD_CATEGORIES.has(category)
}
