/**
 * Country-name → primary tourist-relevant language, keyed the same way as
 * `currencyByCountry.ts` (the lowercased trailing country segment of a
 * Nominatim `display_name`). Countries with multiple official languages map
 * to whichever one a visiting traveler is most likely to need — this isn't
 * a linguistic authority, just a practical default for a phrasebook.
 */
const LANGUAGE_BY_COUNTRY: Record<string, string> = {
  france: 'french',
  belgium: 'french',
  switzerland: 'german',
  germany: 'german',
  austria: 'german',
  spain: 'spanish',
  mexico: 'spanish',
  argentina: 'spanish',
  chile: 'spanish',
  colombia: 'spanish',
  peru: 'spanish',
  italy: 'italian',
  portugal: 'portuguese',
  brazil: 'portuguese',
  japan: 'japanese',
  china: 'mandarin',
  "people's republic of china": 'mandarin',
  taiwan: 'mandarin',
  'south korea': 'korean',
  'republic of korea': 'korean',
  thailand: 'thai',
  vietnam: 'vietnamese',
  indonesia: 'indonesian',
  malaysia: 'malay',
  netherlands: 'dutch',
  greece: 'greek',
  russia: 'russian',
  ukraine: 'ukrainian',
  poland: 'polish',
  turkey: 'turkish',
  türkiye: 'turkish',
  morocco: 'arabic',
  egypt: 'arabic',
  'saudi arabia': 'arabic',
  'united arab emirates': 'arabic',
  uae: 'arabic',
  jordan: 'arabic',
  israel: 'hebrew',
  india: 'hindi',
  'sri lanka': 'sinhala',
  nepal: 'nepali',
  iceland: 'icelandic',
  norway: 'norwegian',
  sweden: 'swedish',
  denmark: 'danish',
  finland: 'finnish',
  'czech republic': 'czech',
  czechia: 'czech',
  hungary: 'hungarian',
  romania: 'romanian',
  croatia: 'croatian',
  cyprus: 'greek',
  luxembourg: 'french',
}

/**
 * Extract the trailing (country, or for US places the state) segment from a
 * cleaned location display name, lowercased for lookup-table matching. Shared
 * by every country-keyed lookup in this feature (language, currency,
 * destination facts) so the segment-parsing rule lives in exactly one place.
 * @param displayName - Full location display name, e.g. "Kyoto, Japan"
 * @returns The lowercased trailing segment, or an empty string if `displayName` has no segments
 */
export function countryForDisplayName(displayName: string): string {
  const segments = displayName.split(',').map((segment) => segment.trim().toLowerCase())
  return segments[segments.length - 1] ?? ''
}

/**
 * Derive a target language from a location's display name by matching its
 * trailing (country) segment against the lookup table.
 * @param displayName - Full location display name, e.g. "Kyoto, Japan"
 * @returns A lowercase language key (used to look up phrases), or null when
 * the country isn't recognized or its language is English (no phrasebook needed)
 */
export function languageForDisplayName(displayName: string): string | null {
  return LANGUAGE_BY_COUNTRY[countryForDisplayName(displayName)] ?? null
}
