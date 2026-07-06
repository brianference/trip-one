import { describe, it, expect } from 'vitest'
import { normalizeLocationSlug } from './slug'

describe('normalizeLocationSlug', () => {
  it('lowercases and hyphenates', () => {
    expect(normalizeLocationSlug('Dublin, Ireland')).toBe('dublin-ireland')
  })

  it('collapses repeated whitespace', () => {
    expect(normalizeLocationSlug('New   York,   USA')).toBe('new-york-usa')
  })

  it('strips diacritics', () => {
    expect(normalizeLocationSlug('São Paulo, Brazil')).toBe('sao-paulo-brazil')
  })

  it('strips punctuation other than hyphens', () => {
    expect(normalizeLocationSlug("Cœur d'Alene, Idaho!")).toBe('coeur-d-alene-idaho')
  })

  it('preserves non-Latin script instead of producing an empty slug', () => {
    // Regression: Latin-only stripping previously reduced this to '', which
    // the backend rejected as an invalid location_slug on trip creation.
    const result = normalizeLocationSlug('東京都, 日本')
    expect(result).not.toBe('')
    expect(result).toBe('東京都-日本')
  })

  it('produces a non-empty slug for any non-Latin input', () => {
    expect(normalizeLocationSlug('Москва, Россия').length).toBeGreaterThan(0)
  })
})
