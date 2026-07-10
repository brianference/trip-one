/**
 * Pronunciation audio for the phrasebook. Primary path: pre-generated
 * Microsoft Edge neural TTS clips (see scripts/generate-phrase-audio.py),
 * served as /audio/<language>/<index>.mp3 — the same high-quality approach as
 * the tokyo-one site, and far better than the browser's robotic
 * SpeechSynthesis, especially for non-Latin scripts. If a clip is missing or
 * fails to load, it falls back to SpeechSynthesis so the button still works.
 */

/** Phrasebook language key (from languageByCountry) → BCP-47 tag for a voice. */
const LANGUAGE_BCP47: Record<string, string> = {
  french: 'fr-FR',
  german: 'de-DE',
  spanish: 'es-ES',
  italian: 'it-IT',
  portuguese: 'pt-PT',
  japanese: 'ja-JP',
  mandarin: 'zh-CN',
  korean: 'ko-KR',
  thai: 'th-TH',
  vietnamese: 'vi-VN',
  indonesian: 'id-ID',
  malay: 'ms-MY',
  dutch: 'nl-NL',
  greek: 'el-GR',
  russian: 'ru-RU',
  ukrainian: 'uk-UA',
  polish: 'pl-PL',
  turkish: 'tr-TR',
  arabic: 'ar-SA',
  hebrew: 'he-IL',
  hindi: 'hi-IN',
  sinhala: 'si-LK',
  nepali: 'ne-NP',
  icelandic: 'is-IS',
  norwegian: 'nb-NO',
  swedish: 'sv-SE',
  danish: 'da-DK',
  finnish: 'fi-FI',
  czech: 'cs-CZ',
  hungarian: 'hu-HU',
  romanian: 'ro-RO',
  croatian: 'hr-HR',
}

/** The BCP-47 tag for a phrasebook language key, if known. */
export function bcp47ForLanguage(languageKey: string | null): string | undefined {
  return languageKey ? LANGUAGE_BCP47[languageKey] : undefined
}

/**
 * The spoken form of a phrase translation: the native script, with the
 * parenthetical romanization dropped ("你好 (Nǐ hǎo)" → "你好") and slash
 * alternatives softened to commas so "Oui / Non" reads as two words, not
 * "Oui slash Non".
 */
export function spokenText(translation: string): string {
  return translation
    .replace(/\s*\([^)]*\)\s*$/, '')
    .replace(/\s*\/\s*/g, ', ')
    .trim()
}

/** Whether the browser can speak (feature-detect before showing the button). */
export function canSpeak(): boolean {
  return typeof window !== 'undefined' && ((typeof Audio !== 'undefined') || ('speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined'))
}

/** URL of the pre-generated pronunciation clip for a phrase. */
export function audioUrlFor(languageKey: string | null, index: number): string | null {
  if (!languageKey) return null
  return `/audio/${languageKey}/${index}.mp3`
}

/**
 * Plays a phrase's pronunciation: first the pre-generated neural clip, and if
 * that's unavailable (missing file, network/codec error, or no Audio support),
 * the SpeechSynthesis fallback. Returns nothing; failures degrade silently.
 * @param translation - The phrase translation (native script + optional romanization)
 * @param languageKey - The phrasebook language key (voice + audio folder)
 * @param index - The phrase's index, for the pre-generated clip path
 */
export function playPhrase(translation: string, languageKey: string | null, index: number): void {
  const url = audioUrlFor(languageKey, index)
  if (url && typeof Audio !== 'undefined') {
    try {
      const audio = new Audio(url)
      // 404 / decode error → fall back to the browser voice.
      audio.addEventListener('error', () => speakPhrase(translation, languageKey), { once: true })
      const played = audio.play()
      if (played && typeof played.catch === 'function') {
        played.catch(() => speakPhrase(translation, languageKey))
      }
      return
    } catch {
      // Fall through to SpeechSynthesis.
    }
  }
  speakPhrase(translation, languageKey)
}

/**
 * Speaks a phrase's native text in the destination language's voice. Cancels
 * any in-progress utterance first so rapid taps don't queue up, and speaks a
 * little slower than default to make the pronunciation easy to follow.
 * @param translation - The phrase translation (native script, optional romanization)
 * @param languageKey - The phrasebook language key, for voice selection
 */
export function speakPhrase(translation: string, languageKey: string | null): void {
  if (!canSpeak()) return
  const text = spokenText(translation)
  if (!text) return
  const synth = window.speechSynthesis
  synth.cancel()
  const utterance = new SpeechSynthesisUtterance(text)
  const code = bcp47ForLanguage(languageKey)
  if (code) utterance.lang = code
  utterance.rate = 0.9
  synth.speak(utterance)
}
