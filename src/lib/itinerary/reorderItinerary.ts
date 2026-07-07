import type { ItineraryItem } from '../validation/schemas'

/**
 * Moves one itinerary item to occupy a new final index in the array,
 * optionally onto a different day. Used for manual reordering (up/down move
 * buttons): unlike `organizeItinerary`, this never re-clusters or re-orders
 * anything else — a manual move is a deliberate override of the smart
 * ordering, not an input to re-run it on.
 * @param items - The full itinerary, in current display order
 * @param fromIndex - Index of the item being moved
 * @param toIndex - The final index the item should occupy after the move
 * @param targetDay - Day to assign the moved item
 * @returns A new array with the item moved and its `day` updated
 */
export function reorderItinerary(
  items: ItineraryItem[],
  fromIndex: number,
  toIndex: number,
  targetDay: number,
): ItineraryItem[] {
  if (fromIndex === toIndex) return items
  const next = [...items]
  const [moved] = next.splice(fromIndex, 1)
  next.splice(toIndex, 0, { ...moved, day: targetDay })
  return next
}
