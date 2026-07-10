import { describe, it, expect } from 'vitest'
import { spokenText, bcp47ForLanguage } from './speech'

describe('spokenText', () => {
  it('strips a trailing parenthetical romanization', () => {
    expect(spokenText('こんにちは (Konnichiwa)')).toBe('こんにちは')
    expect(spokenText('你好 (Nǐ hǎo)')).toBe('你好')
  })

  it('leaves a plain latin phrase untouched', () => {
    expect(spokenText('Bonjour')).toBe('Bonjour')
    expect(spokenText("S'il vous plaît")).toBe("S'il vous plaît")
  })

  it('softens slash alternatives to commas', () => {
    expect(spokenText('Oui / Non')).toBe('Oui, Non')
    expect(spokenText('はい / いいえ (Hai / Iie)')).toBe('はい, いいえ')
  })
})

describe('bcp47ForLanguage', () => {
  it('maps known languages to BCP-47 tags', () => {
    expect(bcp47ForLanguage('japanese')).toBe('ja-JP')
    expect(bcp47ForLanguage('mandarin')).toBe('zh-CN')
    expect(bcp47ForLanguage('french')).toBe('fr-FR')
  })

  it('returns undefined for unknown or null languages', () => {
    expect(bcp47ForLanguage('klingon')).toBeUndefined()
    expect(bcp47ForLanguage(null)).toBeUndefined()
  })
})
