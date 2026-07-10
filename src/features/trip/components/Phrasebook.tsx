import type { Phrase } from '../../localinfo/phrasebook'
import { canSpeak, playPhrase } from '../../localinfo/speech'

/**
 * Shows a real, curated phrase list for a foreign, non-English destination.
 * Each row has a speaker button that speaks the phrase aloud in the
 * destination language's voice (browser SpeechSynthesis), so a traveler can
 * hear the pronunciation, not just read a romanization.
 *
 * Renders nothing when there are no phrases — that means the destination is
 * English-speaking (or the US) and a phrasebook is just noise, or its language
 * isn't one we curate.
 *
 * @param phrases - The curated phrase list, or null when none apply
 * @param language - The phrasebook language key, used to pick the spoken voice
 */
export function Phrasebook({ phrases, language }: { phrases: Phrase[] | null; language: string | null }) {
  if (!phrases || phrases.length === 0) return null
  const speakable = canSpeak()

  return (
    <div className="chronicle-phrasebook">
      <h3>Phrasebook</h3>
      <dl>
        {phrases.map((phrase, index) => (
          <div className="chronicle-phrase-row" key={phrase.english}>
            <dt>{phrase.english}</dt>
            <dd>
              <span className="chronicle-phrase-translation">{phrase.translation}</span>
              {speakable && (
                <button
                  type="button"
                  className="chronicle-phrase-speak"
                  onClick={() => playPhrase(phrase.translation, language, index)}
                  aria-label={`Hear "${phrase.english}" spoken`}
                  title="Hear pronunciation"
                >
                  <span aria-hidden="true">🔊</span>
                </button>
              )}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
