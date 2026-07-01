import { describe, it, expect, vi, afterEach } from 'vitest'
import { getLocationBySlug, upsertLocation, countRecentRequests, createTrip } from './supabaseAdmin'

const env = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-key',
  RATE_LIMIT_SALT: 'salt',
}

describe('supabaseAdmin', () => {
  afterEach(() => vi.restoreAllMocks())

  it('getLocationBySlug returns null on empty result', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => [] }),
    )
    const result = await getLocationBySlug(env, 'nowhere')
    expect(result).toBeNull()
  })

  it('getLocationBySlug returns the row when found', async () => {
    const row = { slug: 'dublin-ireland', lat: 53.35, lng: -6.26, display_name: 'Dublin, Ireland' }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => [row] }))
    const result = await getLocationBySlug(env, 'dublin-ireland')
    expect(result).toEqual(row)
  })

  it('upsertLocation posts with the Prefer merge header', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => [] })
    vi.stubGlobal('fetch', fetchMock)
    await upsertLocation(env, {
      slug: 'dublin-ireland',
      lat: 53.35,
      lng: -6.26,
      display_name: 'Dublin, Ireland',
    })
    const [, init] = fetchMock.mock.calls[0]
    expect(init.headers.Prefer).toContain('resolution=merge-duplicates')
  })

  it('countRecentRequests returns the count from Content-Range', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({ 'content-range': '*/7' }),
        json: async () => [],
      }),
    )
    const count = await countRecentRequests(env, 'somehash', new Date().toISOString())
    expect(count).toBe(7)
  })

  it('countRecentRequests throws on a non-ok response instead of failing open', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        headers: new Headers(),
        json: async () => ({}),
      }),
    )
    await expect(
      countRecentRequests(env, 'somehash', new Date().toISOString()),
    ).rejects.toThrow(/503/)
  })

  it('getLocationBySlug throws on a non-ok response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) }),
    )
    await expect(getLocationBySlug(env, 'dublin-ireland')).rejects.toThrow(/500/)
  })

  it('createTrip throws on a non-ok response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 400, json: async () => ({}) }),
    )
    await expect(
      createTrip(env, { location_slug: 'dublin-ireland', itinerary: [], design_style: 'classic' }),
    ).rejects.toThrow(/400/)
  })
})
