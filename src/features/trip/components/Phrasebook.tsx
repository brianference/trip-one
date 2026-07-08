import type { Phrase } from '../../localinfo/phrasebook'

/**
 * Shows a real, curated phrase list for a foreign, non-English destination.
 * Renders nothing when there are no phrases — that means the destination is
 * English-speaking (or the US) and a phrasebook is just noise, or its
 * language isn't one we curate. A generic Google Translate link added no real
 * value, so there's no fallback.
 */
export function Phrasebook({ phrases }: { phrases: Phrase[] | null }) {
  if (!phrases || phrases.length === 0) return null

  return (
    <div className="chronicle-phrasebook">
      <h3>Phrasebook</h3>
      <dl>
        {phrases.map((phrase) => (
          <div className="chronicle-phrase-row" key={phrase.english}>
            <dt>{phrase.english}</dt>
            <dd>{phrase.translation}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
