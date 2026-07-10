import type { ItineraryItem } from '../validation/schemas'

const FOOD = new Set(['restaurant', 'cafe', 'bar', 'bakery', 'food', 'meal_takeaway', 'meal_delivery'])
const OUTDOORS = new Set(['park', 'natural_feature', 'campground', 'zoo', 'aquarium', 'beach', 'hiking_area', 'amusement_park'])

export interface DaySummary {
  food: number
  outdoors: number
  attractions: number
}

/**
 * Counts a day's stops into three buckets — food, outdoors, and everything
 * else (attractions, museums, sights) — so the Plan page can show at-a-glance
 * chips of the day's shape ("3 sights · 2 food · 1 outdoors").
 */
export function daySummary(items: Pick<ItineraryItem, 'category'>[]): DaySummary {
  const summary: DaySummary = { food: 0, outdoors: 0, attractions: 0 }
  for (const item of items) {
    const category = item.category ?? ''
    if (FOOD.has(category)) summary.food += 1
    else if (OUTDOORS.has(category)) summary.outdoors += 1
    else summary.attractions += 1
  }
  return summary
}

/** Chip labels for a day summary, omitting empty buckets. "" when the day is empty. */
export function daySummaryChips(summary: DaySummary): { key: string; label: string }[] {
  const chips: { key: string; label: string }[] = []
  if (summary.attractions > 0) chips.push({ key: 'attractions', label: `${summary.attractions} ${summary.attractions === 1 ? 'sight' : 'sights'}` })
  if (summary.food > 0) chips.push({ key: 'food', label: `${summary.food} food` })
  if (summary.outdoors > 0) chips.push({ key: 'outdoors', label: `${summary.outdoors} outdoors` })
  return chips
}
