import type { ThingToDo } from '../../lib/api/client'
import type { ItineraryItem } from '../../lib/validation/schemas'
import { isFoodCategory } from '../../lib/places/foodCategories'
import { byPopularity } from '../../lib/places/popularity'
import { haversineKm } from '../../lib/itinerary/dayEffort'
import type { MapMarker } from './MapView'

/**
 * Quality thresholds for map pins (not for the things-to-do list).
 *
 * Measured against the real D1 location backup `backups/20260713T081654Z.json`
 * (59 cached cities, all pin-eligible rows with coordinates):
 *
 * - Recomputed over that dump: 1478 pin-eligible entries (coords present),
 *   of which 1335 carry a rating and 143 do not. Rating percentiles across
 *   the rated set are p10 = 3.8, p25 = 4.2, p50 = 4.5.
 *   MIN_RATING = 4.0 drops 188 of 1335 rated pins (14.1%) — the long tail of
 *   3.x tourist_attraction / cemetery / obscure POI noise — plus all 143
 *   unrated rows, retaining 1147 of 1478 (77.6%) of pin-eligible entries.
 *   Unrated entries are Tripadvisor rows past the enrichment cap and are the
 *   source of junk labels like "Order Suits Sada Plus Tokyo Station…".
 *
 * - Review counts were not persisted on that backup dump (every row omitted
 *   numReviews), so MIN_REVIEWS cannot be a percentile of that file. Live
 *   Google Nearby results that carry a rating also carry user_ratings_total
 *   (mapped to numReviews); Tripadvisor details enrichment maps num_reviews
 *   the same way. The popularity scorer treats log10(reviews + 10) and uses
 *   an obscure-cafe example of ~40 reviews. Require more than that floor so
 *   a handful of brand-new 5★ reviews cannot outrank a real landmark:
 *   MIN_REVIEWS = 50.
 *
 * Restaurants use the same floors, then a proximity filter to the selected
 * day's stops (see RESTAURANT_NEAR_DAY_KM) so highly-rated food near the
 * itinerary plots without scattering city-wide dining across the map.
 */
export const MIN_RATING = 4.0
export const MIN_REVIEWS = 50

/**
 * Max straight-line km from any stop on the selected day for a restaurant pin.
 * dayEffort uses ~4.5 km/h walking pace; 1.5 km is roughly a 20-minute walk —
 * "near this day's activities", not the whole metro area (FOOD_MAX_KM = 15).
 */
export const RESTAURANT_NEAR_DAY_KM = 1.5

/**
 * Hard cap on plotted pins after quality ranking. Real cities in the backup
 * often ship 40–50 coordinate-bearing things_to_do rows (Bologna/Lyon/Porto
 * problem size); capping keeps the map readable while itinerary stops always
 * plot on top regardless of score.
 */
export const MAX_MAP_PINS = 24

export interface SelectMapMarkersInput {
  thingsToDo: ThingToDo[]
  /** Stops already on the plan — always plotted when they have coordinates. */
  itinerary: ItineraryItem[]
  /** Day whose route restaurants must be near (defaults to day 1). */
  selectedDay: number
}

function hasCoords(item: { lat?: number | null; lng?: number | null }): item is { lat: number; lng: number } {
  return item.lat != null && item.lng != null && Number.isFinite(item.lat) && Number.isFinite(item.lng)
}

/**
 * True when a place meets the quality bar for a non-itinerary map pin:
 * real rating at/above {@link MIN_RATING} and review volume at/above
 * {@link MIN_REVIEWS}. Themed places still need coordinates but skip the
 * quality bar so interest-matched pins always show.
 */
function meetsQuality(item: ThingToDo): boolean {
  if (item.themed) return true
  if (item.rating == null || item.rating < MIN_RATING) return false
  if (item.numReviews == null || item.numReviews < MIN_REVIEWS) return false
  return true
}

/**
 * Selects which nearby places become map pins: prefer themed, then high-
 * quality attractions, then highly-rated restaurants near the selected day's
 * stops, always including itinerary stops, never inventing coordinates.
 * Does not mutate the underlying things-to-do list.
 *
 * @param input - Things-to-do pool, itinerary, and selected day
 * @returns Markers for MapView (≤ {@link MAX_MAP_PINS} after itinerary pins)
 */
export function selectMapMarkers(input: SelectMapMarkersInput): MapMarker[] {
  const { thingsToDo, itinerary, selectedDay } = input
  const dayStops: { lat: number; lng: number }[] = itinerary
    .filter((item) => (item.day ?? 1) === selectedDay && hasCoords(item))
    .map((item) => ({ lat: item.lat as number, lng: item.lng as number }))
  const plannedNames = new Set(itinerary.map((item) => item.text.toLowerCase()))

  // Itinerary stops always plot (when they have coords), regardless of score.
  const itineraryMarkers: MapMarker[] = []
  const seen = new Set<string>()
  for (const stop of itinerary) {
    if (!hasCoords(stop)) continue
    const key = stop.text.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    itineraryMarkers.push({
      lat: stop.lat,
      lng: stop.lng,
      label: stop.text,
      category: stop.category ?? 'tourist_attraction',
    })
  }

  const withCoords = thingsToDo.filter((item) => hasCoords(item) && !plannedNames.has(item.name.toLowerCase()))

  const themed = withCoords.filter((item) => item.themed).sort(byPopularity)
  const attractions = withCoords
    .filter((item) => !item.themed && !isFoodCategory(item.category) && meetsQuality(item))
    .sort(byPopularity)
  const restaurants = withCoords
    .filter((item) => !item.themed && isFoodCategory(item.category) && meetsQuality(item))
    .filter((item) => {
      // No day stops yet: keep restaurants near nothing would dump city-wide
      // food on the map. Skip until the day has a plotted stop.
      if (dayStops.length === 0) return false
      return dayStops.some(
        (stop) => haversineKm({ lat: item.lat as number, lng: item.lng as number }, stop) <= RESTAURANT_NEAR_DAY_KM,
      )
    })
    .sort(byPopularity)

  // Prefer themed, then quality attractions, then near-day restaurants.
  const ranked = [...themed, ...attractions, ...restaurants]
  const remainingSlots = Math.max(0, MAX_MAP_PINS - itineraryMarkers.length)
  const extra: MapMarker[] = []
  for (const item of ranked) {
    if (extra.length >= remainingSlots) break
    const key = item.name.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    extra.push({
      lat: item.lat as number,
      lng: item.lng as number,
      label: item.name,
      category: item.category,
      placeId: item.placeId,
    })
  }

  return [...itineraryMarkers, ...extra]
}
