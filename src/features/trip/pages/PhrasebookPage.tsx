import { useTripContext } from '../useTripContext'
import { destinationFor } from '../../localinfo/destination'
import { phrasesForLanguage } from '../../localinfo/phrasebook'
import { Phrasebook } from '../components/Phrasebook'

/**
 * Capitalizes each word of a lowercase country name for display, e.g.
 * "united arab emirates" -> "United Arab Emirates". `destinationFor` keys
 * its lookups on a lowercased country string; this only affects what's shown.
 * @param value - A lowercase (possibly multi-word) country name
 * @returns The same string with each word's first letter capitalized
 */
function toTitleCase(value: string): string {
  return value.replace(/\b\w/g, (char) => char.toUpperCase())
}

/**
 * The Phrasebook page: a real, curated phrase list for the destination's
 * language, resolved from `location.displayName` alone — never the trip's
 * stored `locationSlug`, which is a stale/inconsistent fallback that once
 * caused an English-speaking Tokyo trip to render as "English-speaking".
 * English-speaking destinations show a short note instead of a phrase list
 * (a phrasebook there is just noise), and a destination whose language
 * isn't curated gets an honest "not yet" message rather than a silently
 * empty page.
 */
export function PhrasebookPage() {
  const { location } = useTripContext()
  const destination = destinationFor(location?.displayName)

  if (destination.status === 'loading') {
    return (
      <article className="chronicle-chapter">
        <h1>Phrasebook</h1>
        <p className="chronicle-rate-line">Loading…</p>
      </article>
    )
  }

  const { country, englishSpeaking, language } = destination
  const phrases = phrasesForLanguage(language)
  const countryName = toTitleCase(country)

  return (
    <article className="chronicle-chapter">
      <h1>Phrasebook</h1>
      {phrases && phrases.length > 0 ? (
        <>
          <p className="chronicle-rate-line">A few useful phrases for {countryName}.</p>
          <Phrasebook phrases={phrases} language={language} />
        </>
      ) : englishSpeaking ? (
        <p className="chronicle-rate-line">
          {countryName} is English-speaking, so there’s no phrasebook to show — you’re all set.
        </p>
      ) : (
        <p className="chronicle-rate-line">We don’t have a phrasebook for {countryName} yet.</p>
      )}
    </article>
  )
}
