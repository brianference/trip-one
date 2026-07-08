import { describe, it, expect } from 'vitest'
import { phrasesForLanguage, PHRASES_BY_LANGUAGE } from './phrasebook'

describe('phrasesForLanguage', () => {
  it('returns the real phrase list for a covered language', () => {
    const phrases = phrasesForLanguage('japanese')
    expect(phrases).not.toBeNull()
    expect(phrases?.find((p) => p.english === 'Hello')?.translation).toContain('Konnichiwa')
  })

  it('returns null for an uncovered language', () => {
    expect(phrasesForLanguage('klingon')).toBeNull()
  })

  it('returns null when no language is given', () => {
    expect(phrasesForLanguage(null)).toBeNull()
  })

  it('every language has exactly 8 real phrases, all non-empty', () => {
    for (const [language, phrases] of Object.entries(PHRASES_BY_LANGUAGE)) {
      expect(phrases, language).toHaveLength(8)
      for (const phrase of phrases) {
        expect(phrase.english.trim(), `${language} english`).not.toBe('')
        expect(phrase.translation.trim(), `${language} translation`).not.toBe('')
      }
    }
  })
})
