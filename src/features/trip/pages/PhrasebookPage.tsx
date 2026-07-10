import { useTripContext } from '../useTripContext'
import { languageForDisplayName } from '../../localinfo/languageByCountry'
import { phrasesForLanguage } from '../../localinfo/phrasebook'
import { Phrasebook } from '../components/Phrasebook'

/**
 * The Phrasebook page: a real, curated phrase list for the destination's
 * language. English-speaking destinations (and the US) show a short note
 * instead — a phrasebook there is just noise, and there's never a generic
 * translate link.
 */
export function PhrasebookPage() {
  const { trip, location } = useTripContext()
  const displayName = location?.displayName ?? trip.locationSlug
  const phrases = phrasesForLanguage(languageForDisplayName(displayName))

  return (
    <article className="chronicle-chapter">
      <h1>Phrasebook</h1>
      {phrases && phrases.length > 0 ? (
        <>
          <p className="chronicle-rate-line">A few useful phrases for {displayName}.</p>
          <Phrasebook phrases={phrases} />
        </>
      ) : (
        <p className="chronicle-rate-line">
          {displayName} is English-speaking, so there’s no phrasebook to show — you’re all set.
        </p>
      )}
    </article>
  )
}
