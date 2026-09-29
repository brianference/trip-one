import { languageForDisplayName, countryForDisplayName } from './languageByCountry'
import { currencyForDisplayName } from './currencyByCountry'

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
/** cleanDisplayName drops the country for US trips, leaving "City, State". */
const US_CURRENCY = 'USD'

export type DestinationInfo =
  | { status: 'loading' }
  | { status: 'known'; country: string; international: boolean; englishSpeaking: boolean; language: string | null; currency: string }

/**
 * Everything the trip UI needs to know about where the trip is, from one place.
 * @param displayName - Cleaned location name ("Barcelona, Spain" / "Miami, Florida"); null while loading or after a failed fetch
 * @returns Destination facts, or `loading` when the name is not available yet
 */
export function destinationFor(displayName: string | null | undefined): DestinationInfo {
  if (!displayName) return { status: 'loading' }
  const country = countryForDisplayName(displayName)
  const currency = currencyForDisplayName(displayName)
  const language = languageForDisplayName(displayName)
  const international = !(currency === US_CURRENCY && language === null && !ENGLISH_SPEAKING.has(country))
  return { status: 'known', country, international, englishSpeaking: ENGLISH_SPEAKING.has(country), language, currency }
}
