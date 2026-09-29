/**
 * Static reference data for recognising a US place from a location display
 * name. `cleanDisplayName` drops the country for US places ("Miami, Florida"),
 * so the only positive signal left in the trailing segment is the state name.
 */

/** The country names Nominatim (and people) use for the United States, lowercased. */
export const US_COUNTRY_NAMES: ReadonlySet<string> = new Set(['united states', 'united states of america', 'usa'])

/** US states plus the District of Columbia, lowercased name → USPS two-letter code. */
export const US_STATE_CODES: Readonly<Record<string, string>> = {
  alabama: 'al', alaska: 'ak', arizona: 'az', arkansas: 'ar', california: 'ca', colorado: 'co',
  connecticut: 'ct', delaware: 'de', 'district of columbia': 'dc', florida: 'fl', georgia: 'ga',
  hawaii: 'hi', idaho: 'id', illinois: 'il', indiana: 'in', iowa: 'ia', kansas: 'ks', kentucky: 'ky',
  louisiana: 'la', maine: 'me', maryland: 'md', massachusetts: 'ma', michigan: 'mi', minnesota: 'mn',
  mississippi: 'ms', missouri: 'mo', montana: 'mt', nebraska: 'ne', nevada: 'nv', 'new hampshire': 'nh',
  'new jersey': 'nj', 'new mexico': 'nm', 'new york': 'ny', 'north carolina': 'nc', 'north dakota': 'nd',
  ohio: 'oh', oklahoma: 'ok', oregon: 'or', pennsylvania: 'pa', 'rhode island': 'ri', 'south carolina': 'sc',
  'south dakota': 'sd', tennessee: 'tn', texas: 'tx', utah: 'ut', vermont: 'vt', virginia: 'va',
  washington: 'wa', 'west virginia': 'wv', wisconsin: 'wi', wyoming: 'wy',
}

/** Inhabited US territories, which use the US dollar and need no passport from the mainland. */
const US_TERRITORIES: ReadonlySet<string> = new Set([
  'puerto rico',
  'guam',
  'united states virgin islands',
  'u.s. virgin islands',
  'american samoa',
  'northern mariana islands',
])

/**
 * Whether a lowercased trailing display-name segment positively identifies a
 * US place: a state (or DC), an inhabited territory, or the country itself.
 * Anything else, including a country missing from every lookup table, is not
 * US. Known ambiguity: "Georgia" is both a US state and a country, and the
 * cleaned name alone cannot tell them apart, so it reads as the state.
 * @param segment - Lowercased, trimmed trailing segment, e.g. "florida"
 * @returns True only for a recognised US state, territory, or country name
 */
export function isUsRegion(segment: string): boolean {
  return Object.prototype.hasOwnProperty.call(US_STATE_CODES, segment) || US_TERRITORIES.has(segment) || US_COUNTRY_NAMES.has(segment)
}
