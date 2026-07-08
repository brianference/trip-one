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

/**
 * A glyph per category, shown inside the map marker so pins are
 * distinguishable at a glance (not just by color, which fails for colorblind
 * users). Same keys as CATEGORY_COLORS; anything unlisted uses the default.
 */
export const CATEGORY_ICONS: Record<string, string> = {
  attraction: '📍',
  tourist_attraction: '📸',
  point_of_interest: '📸',
  museum: '🏛️',
  park: '🌳',
  restaurant: '🍽️',
  food: '🍽️',
  cafe: '☕',
  bakery: '🥐',
  bar: '🍸',
  lodging: '🛏️',
  shopping_mall: '🛍️',
  store: '🛍️',
  casino: '🎰',
  zoo: '🦓',
  amusement_park: '🎡',
  church: '⛪',
}

export const DEFAULT_MARKER_ICON = '📍'

/** The marker glyph for a category, falling back to the default pin. */
export function iconForCategory(category: string): string {
  return CATEGORY_ICONS[category] ?? DEFAULT_MARKER_ICON
}

/** Human-readable legend rows, one per real color/icon the map can show. */
export const LEGEND_ENTRIES: { label: string; color: string; icon: string }[] = [
  { label: 'Attraction', color: CATEGORY_COLORS.tourist_attraction, icon: CATEGORY_ICONS.tourist_attraction },
  { label: 'Museum', color: CATEGORY_COLORS.museum, icon: CATEGORY_ICONS.museum },
  { label: 'Park', color: CATEGORY_COLORS.park, icon: CATEGORY_ICONS.park },
  { label: 'Food & drink', color: CATEGORY_COLORS.restaurant, icon: CATEGORY_ICONS.restaurant },
  { label: 'Lodging', color: CATEGORY_COLORS.lodging, icon: CATEGORY_ICONS.lodging },
  { label: 'Shopping', color: CATEGORY_COLORS.shopping_mall, icon: CATEGORY_ICONS.shopping_mall },
  { label: 'Other', color: DEFAULT_MARKER_COLOR, icon: DEFAULT_MARKER_ICON },
]
