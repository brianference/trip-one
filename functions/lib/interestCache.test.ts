import { describe, it, expect } from 'vitest'
import { buildInterestCacheKey, normalizeInterestsForKey } from './interestCache'

describe('normalizeInterestsForKey', () => {
  it('lowercases and collapses whitespace so trivial wording differences share a key', () => {
    expect(normalizeInterestsForKey('Walleye Fishing   and  Hunting')).toBe('walleye fishing and hunting')
  })

  it('strips light punctuation', () => {
    expect(normalizeInterestsForKey('fishing, hunting; hiking.')).toBe('fishing hunting hiking')
  })

  it('trims and bounds the length', () => {
    expect(normalizeInterestsForKey('  surf  ')).toBe('surf')
    expect(normalizeInterestsForKey('x'.repeat(500))).toHaveLength(200)
  })
})

describe('buildInterestCacheKey', () => {
  it('prefixes the slug and appends a 64-char sha-256 hex', async () => {
    const key = await buildInterestCacheKey('ely-minnesota', 'walleye fishing')
    expect(key).toMatch(/^ely-minnesota:[0-9a-f]{64}$/)
  })

  it('is stable for the same destination and interests', async () => {
    const a = await buildInterestCacheKey('ely-minnesota', 'walleye fishing and grouse hunting')
    const b = await buildInterestCacheKey('ely-minnesota', 'Walleye fishing and grouse hunting  ')
    expect(a).toBe(b)
  })

  it('differs when the destination differs', async () => {
    const a = await buildInterestCacheKey('ely-minnesota', 'fishing')
    const b = await buildInterestCacheKey('duluth-minnesota', 'fishing')
    expect(a).not.toBe(b)
  })

  it('differs when the interests differ', async () => {
    const a = await buildInterestCacheKey('ely-minnesota', 'fishing')
    const b = await buildInterestCacheKey('ely-minnesota', 'hiking')
    expect(a).not.toBe(b)
  })
})
