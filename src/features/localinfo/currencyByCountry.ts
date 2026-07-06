const FRANKFURTER_BASE_CURRENCY = 'USD'

/**
 * Minimal country-name → ISO 4217 currency-code lookup, keyed by the
 * lowercased trailing country segment of a Nominatim `display_name` (e.g.
 * "Tokyo, Japan" → "japan" → "JPY").
 *
 * Scoping decision: this covers the major currencies a demo/user is likely
 * to hit rather than a full ISO-3166 country-to-currency database — see
 * task-map-currency-report.md for the rationale. Anything not listed here
 * falls back to `FRANKFURTER_BASE_CURRENCY` (USD).
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
  canada: 'CAD',
  australia: 'AUD',
  switzerland: 'CHF',
  iceland: 'ISK',
  china: 'CNY',
  "people's republic of china": 'CNY',
  india: 'INR',
  mexico: 'MXN',
  brazil: 'BRL',
  'south korea': 'KRW',
  'republic of korea': 'KRW',
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
