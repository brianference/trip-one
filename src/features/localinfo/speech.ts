/**
 * Text-to-speech for the phrasebook. Unlike a single-language trip that can ship
 * pre-recorded audio files, this app covers 30+ languages, so it uses the
 * browser's built-in SpeechSynthesis to speak the native-script text in the
 * destination language's voice — no audio assets, and it works for every
 * language the device has a voice for. The speaker button is hidden when the
 * API is unavailable.
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
  return typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined'
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
