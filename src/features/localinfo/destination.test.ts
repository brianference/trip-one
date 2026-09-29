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
