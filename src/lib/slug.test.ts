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
})
