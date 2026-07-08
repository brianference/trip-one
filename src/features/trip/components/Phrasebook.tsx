import type { Phrase } from '../../localinfo/phrasebook'

const TRANSLATE_URL = 'https://translate.google.com/?sl=en&tl=auto&op=translate'

/**
 * Shows a real, curated phrase list when the destination's language is
 * covered; otherwise falls back to a plain Google Translate link so there's
 * still something useful for languages this app doesn't have phrases for.
 */
export function Phrasebook({ phrases }: { phrases: Phrase[] | null }) {
  if (!phrases) {
    return (
      <a href={TRANSLATE_URL} target="_blank" rel="noopener noreferrer" className="chronicle-phrasebook-fallback-link">
        Phrasebook (Google Translate)
      </a>
    )
  }

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
