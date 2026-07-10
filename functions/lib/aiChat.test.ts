import { describe, it, expect } from 'vitest'
import { buildChatPrompt, normalizeChatResponse } from './aiChat'

const candidates = [
  { name: 'Balboa Park', category: 'park', rating: 4.8 },
  { name: 'Sushi Ota', category: 'restaurant', rating: 4.5 },
]

describe('buildChatPrompt', () => {
  it('offers all four actions and names the current destination', () => {
    const p = buildChatPrompt({ message: 'add food', days: 3, candidates, locationName: 'San Diego, California' })
    expect(p).toContain('"action":"plan"|"answer"|"relocate"|"search"')
    expect(p).toContain('San Diego, California')
    expect(p).toContain('0) Balboa Park')
  })

  it('instructs a nearby search for a specific kind of place not in the list', () => {
    const p = buildChatPrompt({ message: 'add sushi', days: 3, candidates })
    expect(p).toMatch(/"action":"search"/)
    expect(p).toMatch(/searchQuery/)
  })

  it('instructs popular-name normalization for relocate', () => {
    const p = buildChatPrompt({ message: 'make it vegas', days: 3, candidates })
    expect(p).toContain('Las Vegas, Nevada')
    expect(p).toContain('never a tiny obscure town')
  })

  it('requires at least 3 food stops per day', () => {
    const p = buildChatPrompt({ message: 'plan it', days: 3, candidates })
    expect(p).toMatch(/at least 3 different real food\/drink stops/i)
  })
})

describe('normalizeChatResponse', () => {
  it('returns a grounded plan for a plan action', () => {
    const r = normalizeChatResponse({ action: 'plan', message: 'Done.', days: [{ day: 1, placeIndexes: [0, 1] }] }, 2, 3)
    expect(r).toEqual({ action: 'plan', message: 'Done.', days: [{ day: 1, placeIndexes: [0, 1] }], destination: null, searchQuery: null })
  })

  it('returns an answer with no plan change', () => {
    const r = normalizeChatResponse({ action: 'answer', message: 'It is great for kids.' }, 2, 3)
    expect(r).toEqual({ action: 'answer', message: 'It is great for kids.', days: null, destination: null, searchQuery: null })
  })

  it('returns a relocate with a trimmed destination', () => {
    const r = normalizeChatResponse({ action: 'relocate', message: 'Switching!', destination: '  Las Vegas, Nevada  ' }, 2, 3)
    expect(r).toEqual({ action: 'relocate', message: 'Switching!', days: null, destination: 'Las Vegas, Nevada', searchQuery: null })
  })

  it('returns a search with a trimmed query for a specific kind of place', () => {
    const r = normalizeChatResponse({ action: 'search', message: 'Finding sushi…', searchQuery: '  sushi restaurant  ' }, 2, 3)
    expect(r).toEqual({ action: 'search', message: 'Finding sushi…', days: null, destination: null, searchQuery: 'sushi restaurant' })
  })

  it('downgrades a search with no query to an answer', () => {
    const r = normalizeChatResponse({ action: 'search', message: 'Sure' }, 2, 3)
    expect(r?.action).toBe('answer')
  })

  it('downgrades a plan with no usable indices to an answer (never wipes the itinerary)', () => {
    const r = normalizeChatResponse({ action: 'plan', message: 'Hmm.', days: [{ day: 1, placeIndexes: [99] }] }, 2, 3)
    expect(r).toEqual({ action: 'answer', message: 'Hmm.', days: null, destination: null, searchQuery: null })
  })

  it('downgrades a relocate with no destination to an answer', () => {
    const r = normalizeChatResponse({ action: 'relocate', message: 'Where to?' }, 2, 3)
    expect(r?.action).toBe('answer')
  })

  it('returns null when there is nothing usable', () => {
    expect(normalizeChatResponse({ action: 'answer' }, 2, 3)).toBeNull()
    expect(normalizeChatResponse(null, 2, 3)).toBeNull()
  })
})
