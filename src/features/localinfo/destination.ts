import { languageForDisplayName, countryForDisplayName } from './languageByCountry'
import { currencyForDisplayName } from './currencyByCountry'
import { isUsRegion } from '../../lib/location/usRegions'

/** Countries where a visitor gets by in English, so no phrasebook is offered. */
const ENGLISH_SPEAKING = new Set([
  'united states',
  'united kingdom',
  'ireland',
  'australia',
  'new zealand',
  'canada',
  'malta',
  'jamaica',
  'bahamas',
  'singapore',
])
/**
 * Capitalizes each word of a lowercase country name for display, e.g.
 * "united arab emirates" -> "United Arab Emirates". `destinationFor` keys
 * its lookups on a lowercased country string; this only affects what's shown.
 * @param country - A lowercase (possibly multi-word) country name
 * @returns The same string with each word's first letter capitalized
 */
export function countryDisplayName(country: string): string {
  return country.replace(/\b\w/g, (char) => char.toUpperCase())
}

export type DestinationInfo =
  | { status: 'loading' }
  | { status: 'known'; country: string; international: boolean; englishSpeaking: boolean; language: string | null; currency: string | null }

/**
 * Everything the trip UI needs to know about where the trip is, from one place.
 * Domestic is decided positively: the trailing segment must name a US state,
 * territory or the US itself (`cleanDisplayName` leaves US trips as
 * "City, State"). A country missing from every lookup table is international
 * with an unknown (null) currency and language, never silently domestic.
 * @param displayName - Cleaned location name ("Barcelona, Spain" / "Miami, Florida"); null while loading or after a failed fetch
 * @returns Destination facts, or `loading` when the name is not available yet
 */
export function destinationFor(displayName: string | null | undefined): DestinationInfo {
  if (!displayName) return { status: 'loading' }
  const country = countryForDisplayName(displayName)
  const currency = currencyForDisplayName(displayName)
  const language = languageForDisplayName(displayName)
  const domestic = isUsRegion(country)
  const englishSpeaking = domestic || ENGLISH_SPEAKING.has(country)
  return { status: 'known', country, international: !domestic, englishSpeaking, language, currency }
}
