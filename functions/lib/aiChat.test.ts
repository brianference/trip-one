import { describe, it, expect } from 'vitest'
import { buildChatPrompt, normalizeChatResponse, protectExistingStops, parseDayCommand, enforceDayCommand } from './aiChat'

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

// Reproduced on the live site: a scoped chat edit came back having silently
// deleted stops the traveler never mentioned. "add a food stop on day 2"
// returned 3 indices for a day that had 5; "add a museum on day 1" replaced all
// four of the trip's flagship sights. The prompt now asks the model to echo
// what it keeps, but a prompt is a request, so the rule is enforced here.
describe('protectExistingStops', () => {
  const candidates = [
    { name: 'Sagrada Familia', category: 'tourist_attraction' },
    { name: 'Casa Batlló', category: 'tourist_attraction' },
    { name: 'La Boqueria', category: 'market' },
    { name: 'Ciutadella Park', category: 'park' },
    { name: 'Picasso Museum', category: 'museum' },
    { name: 'Ocaña', category: 'restaurant' },
  ]

  it('restores stops the model dropped without being asked', () => {
    // Day 2 had Ciutadella + Picasso; the model answered with only the new food stop.
    const out = protectExistingStops(
      [{ day: 2, placeIndexes: [5] }],
      [{ day: 2, placeNames: ['Ciutadella Park', 'Picasso Museum'] }],
      candidates,
    )
    expect(out[0].placeIndexes).toEqual([5, 3, 4])
  })

  it('keeps the model ordering for what it did return', () => {
    const out = protectExistingStops(
      [{ day: 1, placeIndexes: [2, 0] }],
      [{ day: 1, placeNames: ['Sagrada Familia', 'Casa Batlló', 'La Boqueria'] }],
      candidates,
    )
    // Returned order first, then whatever was silently dropped.
    expect(out[0].placeIndexes).toEqual([2, 0, 1])
  })

  // The distinction that keeps removal working: emptied is intentional.
  it('honours an explicitly emptied day', () => {
    const out = protectExistingStops(
      [{ day: 3, placeIndexes: [] }],
      [{ day: 3, placeNames: ['Sagrada Familia'] }],
      candidates,
    )
    expect(out[0].placeIndexes).toEqual([])
  })

  it('leaves a day alone when nothing was dropped', () => {
    const out = protectExistingStops(
      [{ day: 1, placeIndexes: [0, 1, 5] }],
      [{ day: 1, placeNames: ['Sagrada Familia', 'Casa Batlló'] }],
      candidates,
    )
    expect(out[0].placeIndexes).toEqual([0, 1, 5])
  })

  it('ignores existing stops that are no longer in the candidate list', () => {
    const out = protectExistingStops(
      [{ day: 1, placeIndexes: [0] }],
      [{ day: 1, placeNames: ['Sagrada Familia', 'A place that vanished'] }],
      candidates,
    )
    expect(out[0].placeIndexes).toEqual([0])
  })

  it('does not touch days with no existing plan', () => {
    const out = protectExistingStops([{ day: 4, placeIndexes: [1] }], [{ day: 1, placeNames: ['Sagrada Familia'] }], candidates)
    expect(out[0].placeIndexes).toEqual([1])
  })
})

// The chat told the traveler "I've cleared Day 5 entirely for you" while
// returning action:"answer" and no plan, so nothing was cleared. A message that
// claims a change the response doesn't make is worse than a refusal.
describe('clearing a day', () => {
  it('treats an emptied day as a plan, not an answer', () => {
    const out = normalizeChatResponse(
      { action: 'plan', message: 'Cleared day 3.', days: [{ day: 3, placeIndexes: [] }] },
      10,
      5,
      [{ day: 3, placeNames: ['Somewhere'] }],
      [{ name: 'Somewhere', category: 'park' }],
    )
    expect(out?.action).toBe('plan')
    expect(out?.days).toEqual([{ day: 3, placeIndexes: [] }])
  })

  it('instructs the model that clearing is a plan action', () => {
    const prompt = buildChatPrompt({ message: 'clear day 5', days: 5, candidates: [{ name: 'A', category: 'park' }] })
    expect(prompt).toContain('CLEARING OR EMPTYING a day')
    expect(prompt).toContain('empty placeIndexes array')
  })
})

// Two destructive instructions the model kept getting wrong even after the
// prompt spelled them out: "clear day 5 entirely" returned one stop instead of
// none (deleting four), and "remove the last stop on day 4" returned MORE stops
// than before while claiming it had removed one. Both are now carried out
// deterministically rather than trusted to the model.
describe('parseDayCommand', () => {
  it('recognises clearing a day', () => {
    for (const m of ['clear day 5 entirely', 'empty day 2', 'remove everything on day 3', 'delete all stops on day 1']) {
      expect(parseDayCommand(m), m).toEqual({ op: 'clear', day: Number(/\d+/.exec(m)![0]) })
    }
  })

  it('recognises removing from a day', () => {
    expect(parseDayCommand('remove the last stop on day 4')).toEqual({ op: 'remove', day: 4 })
    expect(parseDayCommand('drop a stop from day 2')).toEqual({ op: 'remove', day: 2 })
  })

  // Additive requests are handled correctly by the model, so they stay with it.
  it('ignores additive and vague messages', () => {
    for (const m of ['add a food stop on day 2', 'make day 3 more relaxed', 'what is the weather', 'remove something']) {
      expect(parseDayCommand(m), m).toBeNull()
    }
  })
})

describe('enforceDayCommand', () => {
  const currentPlan = [{ day: 4, placeNames: ['A', 'B', 'C', 'D'] }, { day: 5, placeNames: ['E', 'F', 'G', 'H'] }]
  const candidates = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].map((name) => ({ name, category: 'park' }))

  it('empties the day even when the model returned stops for it', () => {
    // The real failure: "clear day 5" came back with a single restaurant.
    const out = enforceDayCommand({ op: 'clear', day: 5 }, [{ day: 5, placeIndexes: [26] }], currentPlan, candidates)
    expect(out.days).toEqual([{ day: 5, placeIndexes: [] }])
    expect(out.failed).toBe(false)
  })

  it('leaves other days untouched when clearing one', () => {
    const out = enforceDayCommand(
      { op: 'clear', day: 5 },
      [{ day: 4, placeIndexes: [0, 1] }, { day: 5, placeIndexes: [2] }],
      currentPlan,
      candidates,
    )
    expect(out.days).toEqual([{ day: 4, placeIndexes: [0, 1] }, { day: 5, placeIndexes: [] }])
  })

  it('refuses a "removal" that did not remove anything', () => {
    // Day 4 had 4 stops; the model returned 5.
    const out = enforceDayCommand({ op: 'remove', day: 4 }, [{ day: 4, placeIndexes: [0, 1, 2, 3, 4] }], currentPlan, candidates)
    expect(out.days.find((d) => d.day === 4)).toBeUndefined()
    expect(out.failed).toBe(true)
  })

  it('accepts a genuine removal', () => {
    const out = enforceDayCommand({ op: 'remove', day: 4 }, [{ day: 4, placeIndexes: [0, 1, 2] }], currentPlan, candidates)
    expect(out.days).toEqual([{ day: 4, placeIndexes: [0, 1, 2] }])
    expect(out.failed).toBe(false)
  })
})
