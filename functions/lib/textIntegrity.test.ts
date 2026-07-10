import { describe, it, expect } from 'vitest'
import { isTextCorrupt, anyNameCorrupt, dropCorruptNames } from './textIntegrity'

describe('isTextCorrupt', () => {
  it('passes clean ASCII and CJK text', () => {
    expect(isTextCorrupt('Family Li Imperial Cuisine')).toBe(false)
    expect(isTextCorrupt('慈寿寺塔')).toBe(false)
    expect(isTextCorrupt('交泰殿')).toBe(false)
    expect(isTextCorrupt('')).toBe(false)
  })

  it('passes valid astral characters (proper surrogate pairs)', () => {
    expect(isTextCorrupt('emoji 😀 ok')).toBe(false)
    expect(isTextCorrupt('𝄞 clef')).toBe(false)
  })

  it('flags a lone low surrogate (the historical mojibake signature)', () => {
    // "故宫" + U+DC8D + "物院" — a split multi-byte character
    expect(isTextCorrupt('故宫\uDC8D物院')).toBe(true)
  })

  it('flags a lone high surrogate', () => {
    expect(isTextCorrupt('abc\uD83Dxyz')).toBe(true)
  })

  it('flags the U+FFFD replacement character', () => {
    expect(isTextCorrupt('caf�')).toBe(true)
  })
})

describe('anyNameCorrupt', () => {
  it('is true when at least one name is mojibake', () => {
    expect(anyNameCorrupt([{ name: 'Clean Place' }, { name: '天\uDC9D厅' }])).toBe(true)
  })

  it('is false when all names are clean', () => {
    expect(anyNameCorrupt([{ name: 'Clean Place' }, { name: '交泰殿' }])).toBe(false)
  })

  it('ignores non-string names', () => {
    expect(anyNameCorrupt([{ name: undefined }, {}])).toBe(false)
  })
})

describe('dropCorruptNames', () => {
  it('removes only the mojibake-named items', () => {
    const items = [{ name: 'Keep A' }, { name: '大\uDC8F西街' }, { name: '交泰殿' }]
    expect(dropCorruptNames(items)).toEqual([{ name: 'Keep A' }, { name: '交泰殿' }])
  })
})
