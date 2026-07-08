const US_COUNTRY = new Set(['united states', 'united states of america', 'usa'])

/**
 * Trims a raw Nominatim display name to a clean, human "City, Region" form.
 * Nominatim returns the full administrative chain, e.g.
 * "Miami, Miami-Dade County, Florida, United States". Travelers don't need the
 * county or (for the US) the country: US places read as "City, State"
 * (country dropped), everywhere else as "City, Country". County segments and
 * bare postal codes are always dropped.
 * @param raw - The full display name from the geocoder
 * @returns A trimmed "City, Region" string (or the input unchanged if it has no commas)
 */
export function cleanDisplayName(raw: string): string {
  const parts = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  if (parts.length <= 1) return raw.trim()

  let segs = parts
    .filter((s) => !/\bcounty\b/i.test(s)) // drop county-type segments
    .filter((s) => !/^\d[\d\s-]*$/.test(s)) // drop bare postal codes (e.g. "79059")
  if (segs.length === 0) return parts[0]

  // For US places, drop the country so the region shown is the state.
  if (US_COUNTRY.has(segs[segs.length - 1].toLowerCase())) {
    segs = segs.slice(0, -1)
  }

  if (segs.length === 1) return segs[0]
  return `${segs[0]}, ${segs[segs.length - 1]}`
}
