import { describe, it, expect } from 'vitest'
import { onRequestGet } from './health'
import { fakeD1 } from '../lib/testD1'

describe('GET /api/health', () => {
  it('returns 200 when the database responds', async () => {
    const { env } = fakeD1()
    const res = await onRequestGet({ env } as never)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: 'ok' })
  })

  it('returns 503 when the database errors', async () => {
    const { env } = fakeD1({ fail: true })
    const res = await onRequestGet({ env } as never)
    expect(res.status).toBe(503)
  })
})
