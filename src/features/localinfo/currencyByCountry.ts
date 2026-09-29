import { isUsRegion } from '../../lib/location/usRegions'
import { countryForDisplayName } from './languageByCountry'

const US_DOLLAR = 'USD'

/**
 * Country-name → ISO 4217 currency-code lookup, keyed by the lowercased
 * trailing country segment of a Nominatim `display_name` (e.g.
 * "Tokyo, Japan" → "japan" → "JPY"). Covers common tourist-destination
 * countries with their real currency, rather than a full ISO-3166 database.
 * A country missing from this table has no known currency (null), never a
 * guessed one. Every code here appears in open.er-api.com's USD rates.
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
  taiwan: 'TWD',
}

/**
 * Derive a target currency code from a location's display name by matching
 * its trailing segment: a US state, territory or the US itself is USD
 * (`cleanDisplayName` leaves US places as "City, State"); a listed country is
 * its currency; anything else is unknown.
 * @param displayName - Cleaned location display name, e.g. "Tokyo, Japan" or "Miami, Florida"
 * @returns An ISO 4217 currency code, or null when the place's currency is not known
 */
export function currencyForDisplayName(displayName: string): string | null {
  const country = countryForDisplayName(displayName)
  if (isUsRegion(country)) return US_DOLLAR
  return Object.prototype.hasOwnProperty.call(CURRENCY_BY_COUNTRY, country) ? CURRENCY_BY_COUNTRY[country] : null
}
