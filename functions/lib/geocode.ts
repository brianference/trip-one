export interface GeocodeResult {
  lat: number
  lng: number
  displayName: string
  /** [south, north, west, east], straight from Nominatim's boundingbox field. */
  boundingBox?: [number, number, number, number]
}

/**
 * Geocode a free-text location query via the Nominatim (OpenStreetMap) API.
 * @param query - Free-text location, e.g. "Dublin, Ireland"
 * @returns The first matching result, or null if nothing was found
 */
export async function geocode(query: string): Promise<GeocodeResult | null> {
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&accept-language=en&q=${encodeURIComponent(query)}`
  const res = await fetch(url, { headers: { 'User-Agent': 'trip-one (https://github.com)' } })
  const rows = (await res.json()) as Array<{
    lat: string
    lon: string
    display_name: string
    boundingbox?: [string, string, string, string]
  }>
  const first = rows[0]
  if (!first) return null
  const boundingBox = first.boundingbox
    ? (first.boundingbox.map(Number) as [number, number, number, number])
    : undefined
  return { lat: Number(first.lat), lng: Number(first.lon), displayName: first.display_name, boundingBox }
}

/**
 * Look up up to 5 autocomplete suggestions for a partial location query via
 * the Nominatim (OpenStreetMap) search API.
 *
 * Requests more raw candidates than needed and re-sorts by Nominatim's own
 * `importance` score (roughly: countries and capitals score highest, major
 * cities next, small businesses/streets lowest) so well-known, larger places
 * a traveler is likely searching for surface first — rather than trusting
 * Nominatim's default match-strength ordering, which can rank an obscure
 * exact-text match above a much more likely, more significant place.
 * @param query - Partial free-text location, e.g. "dublin"
 * @returns Matching results (may be empty), ranked by real-world significance
 */
export async function autocompleteSearch(query: string): Promise<GeocodeResult[]> {
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=10&addressdetails=1&accept-language=en&q=${encodeURIComponent(query)}`
  const res = await fetch(url, { headers: { 'User-Agent': 'trip-one (https://github.com)' } })
  const rows = (await res.json()) as Array<{ lat: string; lon: string; display_name: string; importance?: number }>
  return rows
    .slice()
    .sort((a, b) => (b.importance ?? 0) - (a.importance ?? 0))
    .slice(0, 5)
    .map((row) => ({ lat: Number(row.lat), lng: Number(row.lon), displayName: row.display_name }))
}
