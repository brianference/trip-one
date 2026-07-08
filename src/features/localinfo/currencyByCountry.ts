const FRANKFURTER_BASE_CURRENCY = 'USD'

/**
 * Country-name → ISO 4217 currency-code lookup, keyed by the lowercased
 * trailing country segment of a Nominatim `display_name` (e.g.
 * "Tokyo, Japan" → "japan" → "JPY"). Covers common tourist-destination
 * countries with their real currency, rather than a full ISO-3166 database —
 * anything genuinely obscure falls back to `FRANKFURTER_BASE_CURRENCY`
 * (USD), which is an honest "unknown," not a wrong currency guess.
 */
const CURRENCY_BY_COUNTRY: Record<string, string> = {
  'united states': 'USD',
  'united states of america': 'USD',
  usa: 'USD',
  japan: 'JPY',
  'united kingdom': 'GBP',
  uk: 'GBP',
  'great britain': 'GBP',
  ireland: 'EUR',
  france: 'EUR',
  germany: 'EUR',
  italy: 'EUR',
  spain: 'EUR',
  portugal: 'EUR',
  netherlands: 'EUR',
  belgium: 'EUR',
  austria: 'EUR',
  greece: 'EUR',
  finland: 'EUR',
  croatia: 'EUR',
  slovenia: 'EUR',
  slovakia: 'EUR',
  estonia: 'EUR',
  latvia: 'EUR',
  lithuania: 'EUR',
  malta: 'EUR',
  cyprus: 'EUR',
  luxembourg: 'EUR',
  canada: 'CAD',
  australia: 'AUD',
  'new zealand': 'NZD',
  switzerland: 'CHF',
  iceland: 'ISK',
  china: 'CNY',
  "people's republic of china": 'CNY',
  india: 'INR',
  mexico: 'MXN',
  brazil: 'BRL',
  'south korea': 'KRW',
  'republic of korea': 'KRW',
  morocco: 'MAD',
  egypt: 'EGP',
  'south africa': 'ZAR',
  turkey: 'TRY',
  türkiye: 'TRY',
  thailand: 'THB',
  vietnam: 'VND',
  indonesia: 'IDR',
  malaysia: 'MYR',
  singapore: 'SGD',
  philippines: 'PHP',
  'united arab emirates': 'AED',
  uae: 'AED',
  'saudi arabia': 'SAR',
  israel: 'ILS',
  jordan: 'JOD',
  argentina: 'ARS',
  chile: 'CLP',
  colombia: 'COP',
  peru: 'PEN',
  poland: 'PLN',
  czechia: 'CZK',
  'czech republic': 'CZK',
  hungary: 'HUF',
  romania: 'RON',
  norway: 'NOK',
  sweden: 'SEK',
  denmark: 'DKK',
  russia: 'RUB',
  ukraine: 'UAH',
  kenya: 'KES',
  tanzania: 'TZS',
  nepal: 'NPR',
  'sri lanka': 'LKR',
}

/**
 * Derive a target currency code from a location's display name by matching
 * its trailing (country) segment against a small lookup table.
 * @param displayName - Full location display name, e.g. "Tokyo, Japan"
 * @returns An ISO 4217 currency code, defaulting to USD when the country
 * segment isn't recognized
 */
export function currencyForDisplayName(displayName: string): string {
  const segments = displayName.split(',').map((segment) => segment.trim().toLowerCase())
  const country = segments[segments.length - 1] ?? ''
  return CURRENCY_BY_COUNTRY[country] ?? FRANKFURTER_BASE_CURRENCY
}
