import { describe, it, expect, vi, afterEach } from 'vitest'
import { onRequestPost } from './plan'
import { fakeD1 } from '../lib/testD1'

/**
 * An env whose rate-limit COUNT returns `recent`. Includes an OpenAI key
 * unless `withKey` is false — passed explicitly rather than as a defaulted
 * param, because `mkEnv(0, undefined)` would resolve back to the default and
 * silently keep the key set.
 */
function mkEnv(recent = 0, withKey = true) {
  return fakeD1({
    first: (sql) => (sql.includes('COUNT(*)') ? { n: recent } : null),
    extraEnv: withKey ? { OPENAI_API_KEY: 'sk-test' } : {},
  }).env
}

function req(body: unknown, ip = '203.0.113.9') {
  return new Request('https://x/api/plan', {
    method: 'POST',
    headers: { 'CF-Connecting-IP': ip, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const validBody = {
  intent: 'relaxed foodie trip, love ramen',
  days: 2,
  places: [
    { name: 'Ramen Shop', category: 'restaurant', rating: 4.6 },
    { name: 'War Museum', category: 'museum' },
    { name: 'Sushi Bar', category: 'restaurant', rating: 4.8 },
  ],
}

/** Mocks just the OpenAI call (the DB no longer goes through fetch). */
function mockOpenAi(openAiContent: string, opts: { openAiOk?: boolean } = {}) {
  return vi.fn((url: string) => {
    if (url.includes('api.openai.com')) {
      return Promise.resolve({
        ok: opts.openAiOk ?? true,
        status: opts.openAiOk === false ? 500 : 200,
        json: async () => ({ choices: [{ message: { content: openAiContent } }] }),
      })
    }
    throw new Error(`unexpected fetch to ${url}`)
  })
}

describe('POST /api/plan', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    // restoreAllMocks does not undo stubGlobal; without this a leaked fetch
    // stub from one test would answer the next.
    vi.unstubAllGlobals()
  })

  it('returns a grounded plan spanning all days, referencing only supplied indices', async () => {
    vi.stubGlobal('fetch', mockOpenAi(JSON.stringify({ days: [{ day: 1, placeIndexes: [0] }, { day: 2, placeIndexes: [2] }] })))
    const res = await onRequestPost({ env: mkEnv(), request: req(validBody) } as never)
    expect(res.status).toBe(200)
    const body = await res.json()
    // The itinerary spans all requested days (validBody has days: 2).
    expect(body.days.map((d: { day: number }) => d.day)).toEqual([1, 2])
    // The model's own picks survive, and every index is a real supplied one.
    const all = body.days.flatMap((d: { placeIndexes: number[] }) => d.placeIndexes)
    expect(all).toContain(0)
    expect(all).toContain(2)
    expect(all.every((i: number) => i >= 0 && i < validBody.places.length)).toBe(true)
    // No place is used twice across the plan.
    expect(new Set(all).size).toBe(all.length)
  })

  it('drops hallucinated out-of-range indices before returning', async () => {
    vi.stubGlobal('fetch', mockOpenAi(JSON.stringify({ days: [{ day: 1, placeIndexes: [0, 99] }] })))
    const res = await onRequestPost({ env: mkEnv(), request: req(validBody) } as never)
    const body = await res.json()
    const all = body.days.flatMap((d: { placeIndexes: number[] }) => d.placeIndexes)
    expect(all).toContain(0)
    expect(all).not.toContain(99)
    expect(all.every((i: number) => i >= 0 && i < validBody.places.length)).toBe(true)
  })

  it('502s when the model returns nothing usable', async () => {
    vi.stubGlobal('fetch', mockOpenAi(JSON.stringify({ days: [{ day: 1, placeIndexes: [99] }] })))
    const res = await onRequestPost({ env: mkEnv(), request: req(validBody) } as never)
    expect(res.status).toBe(502)
  })

  it('502s when OpenAI errors', async () => {
    vi.stubGlobal('fetch', mockOpenAi('', { openAiOk: false }))
    const res = await onRequestPost({ env: mkEnv(), request: req(validBody) } as never)
    expect(res.status).toBe(502)
  })

  it('rejects an invalid request body with 400', async () => {
    vi.stubGlobal('fetch', mockOpenAi('{}'))
    const res = await onRequestPost({ env: mkEnv(), request: req({ intent: '', days: 0, places: [] }) } as never)
    expect(res.status).toBe(400)
  })

  it('returns 429 when over the rate limit', async () => {
    vi.stubGlobal('fetch', mockOpenAi(JSON.stringify({ days: [{ day: 1, placeIndexes: [0] }] })))
    const res = await onRequestPost({ env: mkEnv(199), request: req(validBody) } as never)
    expect(res.status).toBe(429)
  })

  it('500s when the API key is not configured', async () => {
    const res = await onRequestPost({ env: mkEnv(0, false), request: req(validBody) } as never)
    expect(res.status).toBe(500)
  })
})

// A request can name a destination and a party but no activities ("12 days in
// Dublin for a father and son, the son is turning 21"). That reached /api/plan
// as an empty intent, which used to 400 and strand the user on the home page
// with "invalid request" and no trip.
describe('POST /api/plan with no stated interests', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('plans a trip instead of rejecting an empty intent', async () => {
    vi.stubGlobal('fetch', mockOpenAi(JSON.stringify({ days: [{ day: 1, placeIndexes: [0] }, { day: 2, placeIndexes: [1] }] })))
    const res = await onRequestPost({ env: mkEnv(), request: req({ ...validBody, intent: '' }) } as never)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.days).toHaveLength(2)
  })

  it('plans a trip when intent is omitted entirely', async () => {
    vi.stubGlobal('fetch', mockOpenAi(JSON.stringify({ days: [{ day: 1, placeIndexes: [0] }, { day: 2, placeIndexes: [1] }] })))
    const { intent: _intent, ...noIntent } = validBody
    const res = await onRequestPost({ env: mkEnv(), request: req(noIntent) } as never)
    expect(res.status).toBe(200)
  })

  it('asks the model for the destination highlights rather than an empty brief', async () => {
    const spy = mockOpenAi(JSON.stringify({ days: [{ day: 1, placeIndexes: [0] }, { day: 2, placeIndexes: [1] }] }))
    vi.stubGlobal('fetch', spy)
    await onRequestPost({ env: mkEnv(), request: req({ ...validBody, intent: '' }) } as never)
    const [, init] = spy.mock.calls[0] as unknown as [string, { body: string }]
    const sent = JSON.parse(init.body)
    expect(sent.messages[0].content).toContain('best-known highlights')
  })
})
