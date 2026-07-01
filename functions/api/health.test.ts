import { describe, it, expect, vi, afterEach } from 'vitest'
import { onRequestGet } from './health'

const env = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'key',
  RATE_LIMIT_SALT: 'salt',
}

describe('GET /api/health', () => {
  afterEach(() => vi.restoreAllMocks())

  it('returns 200 when Supabase responds', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => [] }))
    const res = await onRequestGet({ env } as never)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: 'ok' })
  })

  it('returns 503 when Supabase errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')))
    const res = await onRequestGet({ env } as never)
    expect(res.status).toBe(503)
  })
})
