export interface GeocodeResult {
  lat: number
  lng: number
  displayName: string
}

/**
 * Geocode a free-text location query via the Nominatim (OpenStreetMap) API.
 * @param query - Free-text location, e.g. "Dublin, Ireland"
 * @returns The first matching result, or null if nothing was found
 */
export async function geocode(query: string): Promise<GeocodeResult | null> {
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`
  const res = await fetch(url, { headers: { 'User-Agent': 'trip-one (https://github.com)' } })
  const rows = (await res.json()) as Array<{ lat: string; lon: string; display_name: string }>
  const first = rows[0]
  if (!first) return null
  return { lat: Number(first.lat), lng: Number(first.lon), displayName: first.display_name }
}
