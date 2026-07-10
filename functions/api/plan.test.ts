import { describe, it, expect, vi, afterEach } from 'vitest'
import { onRequestPost } from './plan'

const env = {
  SUPABASE_URL: 'https://x.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'k',
  RATE_LIMIT_SALT: 'salt',
  OPENAI_API_KEY: 'sk-test',
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

/** Mocks the rate-log reads/writes plus an OpenAI response returning `content`. */
function mockBackend(openAiContent: string, opts: { recent?: number; openAiOk?: boolean } = {}) {
  return vi.fn((url: string, init?: RequestInit) => {
    if (url.includes('/rest/v1/request_log') && (!init || init.method === undefined)) {
      return Promise.resolve({ ok: true, headers: new Headers({ 'content-range': `*/${opts.recent ?? 0}` }), json: async () => [] })
    }
    if (url.includes('/rest/v1/request_log')) {
      return Promise.resolve({ ok: true, json: async () => [] })
    }
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
  afterEach(() => vi.restoreAllMocks())

  it('returns a grounded plan referencing only supplied place indices', async () => {
    vi.stubGlobal('fetch', mockBackend(JSON.stringify({ days: [{ day: 1, placeIndexes: [0] }, { day: 2, placeIndexes: [2] }] })))
    const res = await onRequestPost({ env, request: req(validBody) } as never)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.days).toEqual([
      { day: 1, placeIndexes: [0] },
      { day: 2, placeIndexes: [2] },
    ])
  })

  it('drops hallucinated out-of-range indices before returning', async () => {
    vi.stubGlobal('fetch', mockBackend(JSON.stringify({ days: [{ day: 1, placeIndexes: [0, 99] }] })))
    const res = await onRequestPost({ env, request: req(validBody) } as never)
    const body = await res.json()
    // The hallucinated index 99 is dropped; only real indices remain (food-per-day
    // enforcement may add other REAL indices, but never the out-of-range one).
    const all = body.days.flatMap((d: { placeIndexes: number[] }) => d.placeIndexes)
    expect(all).toContain(0)
    expect(all).not.toContain(99)
    expect(all.every((i: number) => i >= 0 && i < validBody.places.length)).toBe(true)
  })

  it('502s when the model returns nothing usable', async () => {
    vi.stubGlobal('fetch', mockBackend(JSON.stringify({ days: [{ day: 1, placeIndexes: [99] }] })))
    const res = await onRequestPost({ env, request: req(validBody) } as never)
    expect(res.status).toBe(502)
  })

  it('502s when OpenAI errors', async () => {
    vi.stubGlobal('fetch', mockBackend('', { openAiOk: false }))
    const res = await onRequestPost({ env, request: req(validBody) } as never)
    expect(res.status).toBe(502)
  })

  it('rejects an invalid request body with 400', async () => {
    vi.stubGlobal('fetch', mockBackend('{}'))
    const res = await onRequestPost({ env, request: req({ intent: '', days: 0, places: [] }) } as never)
    expect(res.status).toBe(400)
  })

  it('returns 429 when over the rate limit', async () => {
    vi.stubGlobal('fetch', mockBackend(JSON.stringify({ days: [{ day: 1, placeIndexes: [0] }] }), { recent: 199 }))
    const res = await onRequestPost({ env, request: req(validBody) } as never)
    expect(res.status).toBe(429)
  })

  it('500s when the API key is not configured', async () => {
    const res = await onRequestPost({ env: { ...env, OPENAI_API_KEY: undefined }, request: req(validBody) } as never)
    expect(res.status).toBe(500)
  })
})
