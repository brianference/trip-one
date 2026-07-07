/**
 * A small, fixed palette for common things-to-do categories, shared between
 * `MapView` (marker pin colors) and the on-page legend so the two can never
 * drift out of sync. Anything not listed here falls back to a shared
 * default color, both on the map and in the legend.
 */
export const CATEGORY_COLORS: Record<string, string> = {
  attraction: '#e2492f',
  tourist_attraction: '#5ba3ff',
  point_of_interest: '#5ba3ff',
  museum: '#a5d088',
  park: '#3fae57',
  restaurant: '#ff8c00',
  food: '#ff8c00',
  cafe: '#ff8c00',
  lodging: '#b28dff',
  shopping_mall: '#e2b23f',
  store: '#e2b23f',
}

export const DEFAULT_MARKER_COLOR = '#e2492f'

/** Human-readable legend rows, one per real color the map can show. */
export const LEGEND_ENTRIES: { label: string; color: string }[] = [
  { label: 'Attraction', color: CATEGORY_COLORS.tourist_attraction },
  { label: 'Museum', color: CATEGORY_COLORS.museum },
  { label: 'Park', color: CATEGORY_COLORS.park },
  { label: 'Food & drink', color: CATEGORY_COLORS.restaurant },
  { label: 'Lodging', color: CATEGORY_COLORS.lodging },
  { label: 'Shopping', color: CATEGORY_COLORS.shopping_mall },
  { label: 'Other', color: DEFAULT_MARKER_COLOR },
]
