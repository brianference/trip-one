// Builds a Weather Underground hourly-forecast URL for a place and date, e.g.
// https://www.wunderground.com/hourly/us/wy/yellowstone-national-park/date/2026-06-26
// US places use /us/{state}/{city}; other countries use /{cc}/{city}. When the
// region/country can't be resolved we fall back to a Google weather search so
// the link always goes somewhere real.

const US_STATES: Record<string, string> = {
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

// Common travel countries → ISO 3166-1 alpha-2 (Weather Underground's country slug).
const COUNTRIES: Record<string, string> = {
  argentina: 'ar', australia: 'au', austria: 'at', belgium: 'be', brazil: 'br', canada: 'ca', chile: 'cl',
  china: 'cn', colombia: 'co', croatia: 'hr', czechia: 'cz', 'czech republic': 'cz', denmark: 'dk',
  egypt: 'eg', finland: 'fi', france: 'fr', germany: 'de', greece: 'gr', 'hong kong': 'hk', hungary: 'hu',
  iceland: 'is', india: 'in', indonesia: 'id', ireland: 'ie', israel: 'il', italy: 'it', japan: 'jp',
  malaysia: 'my', mexico: 'mx', morocco: 'ma', netherlands: 'nl', 'new zealand': 'nz', norway: 'no',
  peru: 'pe', philippines: 'ph', poland: 'pl', portugal: 'pt', romania: 'ro', russia: 'ru', singapore: 'sg',
  'south korea': 'kr', 'korea': 'kr', spain: 'es', sweden: 'se', switzerland: 'ch', taiwan: 'tw',
  thailand: 'th', turkey: 'tr', 'united arab emirates': 'ae', uae: 'ae', 'united kingdom': 'gb', uk: 'gb',
  'united states': 'us', usa: 'us', vietnam: 'vn',
}

/** URL-safe slug from a place name, stripping accents ("Ševětín" → "sevetin"). */
export function slugifyPlace(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function googleWeatherUrl(displayName: string, date: string): string {
  const when = new Date(`${date}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  return `https://www.google.com/search?q=${encodeURIComponent(`hourly weather ${displayName} ${when}`)}`
}

/**
 * Weather Underground hourly URL for a "City, Region" display name and a
 * YYYY-MM-DD date. Falls back to a Google weather search when the region or
 * country isn't recognized, so the "Hourly" link always resolves.
 */
export function hourlyForecastUrl(displayName: string, date: string): string {
  const parts = displayName.split(',').map((s) => s.trim())
  const city = parts[0] ?? ''
  const region = (parts[parts.length - 1] ?? '').toLowerCase()
  const citySlug = slugifyPlace(city)
  if (!citySlug) return googleWeatherUrl(displayName, date)

  const state = US_STATES[region]
  if (state) return `https://www.wunderground.com/hourly/us/${state}/${citySlug}/date/${date}`

  const cc = COUNTRIES[region]
  if (cc) return `https://www.wunderground.com/hourly/${cc}/${citySlug}/date/${date}`

  return googleWeatherUrl(displayName, date)
}
