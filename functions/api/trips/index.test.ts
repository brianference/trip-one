import { describe, it, expect } from 'vitest'
import { onRequestPost } from './index'
import { fakeD1 } from '../../lib/testD1'

describe('POST /api/trips', () => {
  it('creates a trip with a valid location_slug', async () => {
    const { env } = fakeD1()
    const request = new Request('https://x/api/trips', {
      method: 'POST',
      body: JSON.stringify({ location_slug: 'dublin-ireland' }),
    })
    const res = await onRequestPost({ env, request } as never)
    expect(res.status).toBe(201)
    const body = await res.json()
    // D1 generates the id (Postgres used to); it's a real uuid, not a fixed value.
    expect(body.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(body.location_slug).toBe('dublin-ireland')
  })

  it('defaults design_style to chronicle when none is sent', async () => {
    const { env, calls } = fakeD1()
    const request = new Request('https://x/api/trips', {
      method: 'POST',
      body: JSON.stringify({ location_slug: 'dublin-ireland' }),
    })
    await onRequestPost({ env, request } as never)
    const insert = calls.find((c) => c.sql.includes('INSERT INTO trips'))
    // design_style is the 4th bound column: (id, location_slug, itinerary, design_style, created_at)
    expect(insert?.args[3]).toBe('chronicle')
  })

  it('rate-limits trip creation past the hourly cap (and does not create a trip)', async () => {
    const { env, calls } = fakeD1({
      first: (sql) => (sql.includes('COUNT(*)') ? { n: 500 } : null),
    })
    const request = new Request('https://x/api/trips', {
      method: 'POST',
      body: JSON.stringify({ location_slug: 'dublin-ireland' }),
    })
    const res = await onRequestPost({ env, request } as never)
    expect(res.status).toBe(429)
    expect(calls.some((c) => c.sql.includes('INSERT INTO trips'))).toBe(false)
  })

  it('rejects a missing location_slug', async () => {
    const { env } = fakeD1()
    const request = new Request('https://x/api/trips', { method: 'POST', body: JSON.stringify({}) })
    const res = await onRequestPost({ env, request } as never)
    expect(res.status).toBe(400)
  })

  it('returns 500 when the database throws', async () => {
    const { env } = fakeD1({ fail: true })
    const request = new Request('https://x/api/trips', {
      method: 'POST',
      body: JSON.stringify({ location_slug: 'dublin-ireland' }),
    })
    const res = await onRequestPost({ env, request } as never)
    expect(res.status).toBe(500)
    expect((await res.json()).error).toBe('Something went wrong on our end. Please try again in a moment.')
  })
})
