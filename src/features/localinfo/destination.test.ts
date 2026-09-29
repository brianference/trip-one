import { describe, it, expect } from 'vitest'
import fixtures from './__fixtures__/liveDisplayNames.json'
import { destinationFor } from './destination'

const byQuery = (q: string) => fixtures.find((f: { query: string }) => f.query === q)!.clean as string

describe('destinationFor (real Nominatim names from prod)', () => {
  it('Tokyo is international, Japanese, JPY', () => {
    expect(destinationFor(byQuery('Tokyo, Japan'))).toMatchObject({
      status: 'known',
      international: true,
      language: 'japanese',
      currency: 'JPY',
    })
  })

  it('Miami is domestic, so no phrasebook and no money page', () => {
    expect(destinationFor(byQuery('Miami, Florida'))).toMatchObject({ status: 'known', international: false })
  })

  it('Dublin is international and English-speaking', () => {
    expect(destinationFor(byQuery('Dublin, Ireland'))).toMatchObject({
      international: true,
      englishSpeaking: true,
      language: null,
      currency: 'EUR',
    })
  })

  it('Ljubljana is international, not English-speaking, and has no phrasebook yet', () => {
    expect(destinationFor(byQuery('Ljubljana, Slovenia'))).toMatchObject({
      international: true,
      englishSpeaking: false,
      language: null,
    })
  })

  it('Nicosia maps to Greek', () => {
    expect(destinationFor(byQuery('Nicosia, Cyprus'))).toMatchObject({ language: 'greek' })
  })

  it('Barcelona is international, Spanish, EUR', () => {
    expect(destinationFor(byQuery('Barcelona, Spain'))).toMatchObject({
      international: true,
      englishSpeaking: false,
      language: 'spanish',
      currency: 'EUR',
    })
  })

  it('Marrakesh is international, Arabic, MAD', () => {
    expect(destinationFor(byQuery('Marrakesh, Morocco'))).toMatchObject({
      international: true,
      englishSpeaking: false,
      language: 'arabic',
      currency: 'MAD',
    })
  })

  it('Hanoi is international, Vietnamese, VND, and the diacritic city name still resolves', () => {
    expect(destinationFor(byQuery('Hanoi, Vietnam'))).toMatchObject({
      international: true,
      englishSpeaking: false,
      language: 'vietnamese',
      currency: 'VND',
    })
  })

  it('Valletta is international and English-speaking, with no phrasebook needed', () => {
    expect(destinationFor(byQuery('Valletta, Malta'))).toMatchObject({
      international: true,
      englishSpeaking: true,
      language: null,
      currency: 'EUR',
    })
  })

  it('Havana (not in any lookup table) is international with unknown language and currency, never silently domestic', () => {
    expect(destinationFor(byQuery('Havana, Cuba'))).toMatchObject({
      status: 'known',
      country: 'cuba',
      international: true,
      englishSpeaking: false,
      language: null,
      currency: null,
    })
  })

  it('Phnom Penh (not in any lookup table) is international with unknown currency', () => {
    expect(destinationFor(byQuery('Phnom Penh, Cambodia'))).toMatchObject({
      international: true,
      englishSpeaking: false,
      language: null,
      currency: null,
    })
  })

  it('Taipei is international, Mandarin, TWD', () => {
    expect(destinationFor(byQuery('Taipei, Taiwan'))).toMatchObject({
      international: true,
      englishSpeaking: false,
      language: 'mandarin',
      currency: 'TWD',
    })
  })

  it('Miami is domestic, English-speaking, USD', () => {
    expect(destinationFor(byQuery('Miami, Florida'))).toMatchObject({ international: false, englishSpeaking: true, currency: 'USD' })
  })

  it('a US city whose cleaned name ends in the state "Georgia" is domestic', () => {
    expect(destinationFor('Atlanta, Georgia')).toMatchObject({ status: 'known', international: false, currency: 'USD' })
  })

  it('"United States" or "USA" as the trailing segment is domestic', () => {
    expect(destinationFor('Somewhere, United States')).toMatchObject({ international: false, currency: 'USD' })
    expect(destinationFor('Somewhere, USA')).toMatchObject({ international: false, currency: 'USD' })
  })

  it('null means loading, never English-speaking', () => {
    expect(destinationFor(null)).toEqual({ status: 'loading' })
  })

  it('undefined means loading too', () => {
    expect(destinationFor(undefined)).toEqual({ status: 'loading' })
  })

  it('empty string means loading, not a known destination', () => {
    expect(destinationFor('')).toEqual({ status: 'loading' })
  })
})
