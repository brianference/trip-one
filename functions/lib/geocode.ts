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
/**
 * Type-ahead place suggestions.
 *
 * Uses Photon rather than Nominatim. Nominatim is a geocoder: it matches whole
 * tokens, so a partial word returns nothing useful — typing "dubl" produced a
 * private road in Luton and a Russian mountain peak, and never Dublin. Photon
 * is built on the same OpenStreetMap data specifically for prefix search, and
 * returns Dublin, Ireland first for the same input.
 *
 * Nominatim is still used for the final geocode (see `geocode`), where the
 * input is a complete place name and its precision is what we want.
 *
 * Fails soft: any upstream problem yields an empty list, and the caller's
 * free-text flow still works.
 */
export async function autocompleteSearch(query: string): Promise<GeocodeResult[]> {
  const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=12&lang=en`
  const res = await fetch(url, { headers: { 'User-Agent': 'trip-one (https://trip-one.pages.dev)' } })
  if (!res.ok) return []

  const body = (await res.json()) as {
    features?: Array<{
      geometry?: { coordinates?: [number, number] }
      properties?: Record<string, string | undefined>
    }>
  }

  const seen = new Set<string>()
  return (body.features ?? [])
    .map((f) => {
      const p = f.properties ?? {}
      const [lng, lat] = f.geometry?.coordinates ?? []
      if (typeof lat !== 'number' || typeof lng !== 'number') return null
      const name = p.name?.trim()
      if (!name) return null

      // A readable, unambiguous label: the place, then the region and country
      // that disambiguate it ("Dublin, Leinster, Ireland").
      const parts = [name, p.state ?? p.county, p.country].filter(
        (v, i, arr): v is string => Boolean(v) && arr.indexOf(v) === i,
      )
      return { lat, lng, displayName: parts.join(', '), rank: rankPlace(p.type, p.osm_value) }
    })
    .filter((r): r is GeocodeResult & { rank: number } => r !== null)
    .filter((r) => {
      // Photon happily returns several entries for the same city; keep the
      // best-ranked one only.
      const key = r.displayName.toLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .sort((a, b) => a.rank - b.rank)
    .slice(0, 6)
    .map(({ lat, lng, displayName }) => ({ lat, lng, displayName }))
}

/**
 * Sort weight for a suggestion, lowest first.
 *
 * Somewhere you can base a trip beats a building you might visit, which beats
 * a street address — a traveller typing a few letters means a destination, not
 * a house number.
 */
function rankPlace(type?: string, osmValue?: string): number {
  if (type === 'city') return 0
  if (osmValue === 'town' || type === 'town') return 1
  if (type === 'state' || type === 'county') return 2
  if (type === 'country') return 3
  if (type === 'village' || osmValue === 'village') return 4
  if (type === 'house' || type === 'street') return 6
  return 5
}

