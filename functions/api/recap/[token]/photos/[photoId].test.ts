// @vitest-environment node
import { describe, it, expect, vi, afterEach } from 'vitest'
import { onRequestGet } from './[photoId]'
import { fakeR2 } from '../../../../lib/testD1'
import { PNG_BYTES } from '../../../../lib/testPhotos'
import {
  recapEnv,
  defaultRecapState,
  PHOTO_ID,
  OTHER_PHOTO_ID,
  ACTIVE_TOKEN,
  REVOKED_TOKEN,
  UNKNOWN_TOKEN,
  OTHER_TOKEN,
  TRIP_ID,
  OTHER_TRIP_ID,
} from '../../../../lib/testRecap'
import { logger } from '../../../../../src/lib/logger'

type RecapEnv = ReturnType<typeof recapEnv>['env']

const MISSING_PHOTO_ID = '9f000000-0000-4000-8000-0000000000ee'

/** A bucket holding PNG bytes for every photo in the default state, with R2 metadata that disagrees with D1. */
function filledBucket() {
  const r2 = fakeR2()
  for (const photo of defaultRecapState().photos) {
    r2.objects.set(photo.r2_key, { bytes: new Uint8Array(PNG_BYTES), contentType: 'text/html' })
  }
  return r2
}

/** GETs a photo through a recap token. */
function get(env: RecapEnv, token: string, photoId: string) {
  return onRequestGet({ env, request: new Request('https://x'), params: { token, photoId } })
}

/** Status, every header and the body text, for byte-for-byte comparison of two responses. */
async function snapshot(res: Response) {
  return { status: res.status, headers: Array.from(res.headers.entries()), body: await res.text() }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('GET /api/recap/:token/photos/:photoId', () => {
  it('serves the bytes with the DB-recorded type, a one-hour private cache and nosniff', async () => {
    const state = defaultRecapState()
    state.photos[0] = { ...state.photos[0], content_type: 'image/png' }
    const { env } = recapEnv(state, { r2: filledBucket() })
    const res = await get(env, ACTIVE_TOKEN, PHOTO_ID)
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('image/png')
    expect(res.headers.get('Cache-Control')).toBe('private, max-age=3600')
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff')
    expect(Array.from(new Uint8Array(await res.arrayBuffer()))).toEqual(Array.from(PNG_BYTES))
  })

  it('answers 404 for a photo id from another trip, identical to a missing photo', async () => {
    const { env } = recapEnv(defaultRecapState(), { r2: filledBucket() })
    const crossTrip = await snapshot(await get(env, ACTIVE_TOKEN, OTHER_PHOTO_ID))
    const missing = await snapshot(await get(env, ACTIVE_TOKEN, MISSING_PHOTO_ID))
    expect(crossTrip.status).toBe(404)
    expect(crossTrip).toEqual(missing)

    // The same photo IS served through its own trip's token, so the 404 above
    // is the scoping, not a broken fixture.
    expect((await get(env, OTHER_TOKEN, OTHER_PHOTO_ID)).status).toBe(200)
  })

  it('answers revoked and unknown tokens with the same 404 as a missing photo', async () => {
    const { env } = recapEnv(defaultRecapState(), { r2: filledBucket() })
    const missing = await snapshot(await get(env, ACTIVE_TOKEN, MISSING_PHOTO_ID))
    expect(await snapshot(await get(env, REVOKED_TOKEN, PHOTO_ID))).toEqual(missing)
    expect(await snapshot(await get(env, UNKNOWN_TOKEN, PHOTO_ID))).toEqual(missing)
  })

  it('answers malformed params with the same 404 without touching the database', async () => {
    const { env, calls } = recapEnv(defaultRecapState(), { r2: filledBucket() })
    const missing = await snapshot(await get(env, ACTIVE_TOKEN, MISSING_PHOTO_ID))
    const before = calls.length
    expect(await snapshot(await get(env, 'short', PHOTO_ID))).toEqual(missing)
    expect(await snapshot(await get(env, ACTIVE_TOKEN, '..%2F..%2Fsecret'))).toEqual(missing)
    expect(calls).toHaveLength(before)
  })

  it('answers 404 when the row exists but the R2 object is gone', async () => {
    vi.spyOn(logger, 'warn').mockImplementation(() => {})
    const { env } = recapEnv()
    expect((await get(env, ACTIVE_TOKEN, PHOTO_ID)).status).toBe(404)
  })

  it('rate-limits with 429 under its own recap-photo-read key at 3000 per hour', async () => {
    const state = defaultRecapState()
    state.recentRequests = 2999
    const { env, calls } = recapEnv(state, { r2: filledBucket() })
    expect((await get(env, ACTIVE_TOKEN, PHOTO_ID)).status).toBe(200)
    const args = calls.find((c) => c.sql.includes('FROM request_log'))?.args
    expect(args).toContain('recap-photo-read')
    expect(args).not.toContain('recap-read')

    state.recentRequests = 3000
    expect((await get(env, ACTIVE_TOKEN, PHOTO_ID)).status).toBe(429)
  })

  it('answers 500 without either trip id when R2 is unreachable', async () => {
    vi.spyOn(logger, 'error').mockImplementation(() => {})
    const { env } = recapEnv(defaultRecapState(), { r2: fakeR2(true) })
    const res = await get(env, ACTIVE_TOKEN, PHOTO_ID)
    expect(res.status).toBe(500)
    const text = await res.text()
    expect(text).not.toContain(TRIP_ID)
    expect(text).not.toContain(OTHER_TRIP_ID)
  })
})
