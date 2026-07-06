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
 * @param query - Partial free-text location, e.g. "dublin"
 * @returns Matching results (may be empty)
 */
export async function autocompleteSearch(query: string): Promise<GeocodeResult[]> {
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=5&addressdetails=1&accept-language=en&q=${encodeURIComponent(query)}`
  const res = await fetch(url, { headers: { 'User-Agent': 'trip-one (https://github.com)' } })
  const rows = (await res.json()) as Array<{ lat: string; lon: string; display_name: string }>
  return rows.map((row) => ({ lat: Number(row.lat), lng: Number(row.lon), displayName: row.display_name }))
}
