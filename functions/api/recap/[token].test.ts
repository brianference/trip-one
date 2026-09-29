// @vitest-environment node
import { describe, it, expect, vi, afterEach } from 'vitest'
import { onRequestGet } from './[token]'
import type { RecapPayload } from '../../../src/features/recap/types'
import {
  recapEnv,
  defaultRecapState,
  tripRow,
  TRIP_ID,
  TRIP_ITINERARY,
  STOP_ID,
  SECOND_STOP_ID,
  PHOTO_ID,
  SECOND_PHOTO_ID,
  OTHER_PHOTO_ID,
  ACTIVE_TOKEN,
  REVOKED_TOKEN,
  UNKNOWN_TOKEN,
} from '../../lib/testRecap'
import { photoRow } from '../../lib/testPhotos'
import { logger } from '../../../src/lib/logger'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

type RecapEnv = ReturnType<typeof recapEnv>['env']

/** GETs the recap for a token. */
function get(env: RecapEnv, token: string) {
  return onRequestGet({ env, request: new Request(`https://x/api/recap/${token}`), params: { token } })
}

/** Status, every header and the body text, for byte-for-byte comparison of two responses. */
async function snapshot(res: Response) {
  return { status: res.status, headers: Array.from(res.headers.entries()), body: await res.text() }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('GET /api/recap/:token', () => {
  it('never contains the trip id anywhere in the body (the core privacy assertion)', async () => {
    const { env } = recapEnv()
    const res = await get(env, ACTIVE_TOKEN)
    expect(res.status).toBe(200)
    const text = await res.text()
    // The fixture deliberately plants the trip id in a stop's bookingUrl, so
    // this fails if any raw itinerary field is passed through.
    expect(JSON.stringify(TRIP_ITINERARY)).toContain(TRIP_ID)
    expect(text.toLowerCase()).not.toContain(TRIP_ID.toLowerCase())
  })

  it('returns exactly the RecapPayload fields, with a cleaned display name', async () => {
    const { env } = recapEnv()
    const body = (await (await get(env, ACTIVE_TOKEN)).json()) as RecapPayload
    expect(Object.keys(body).sort()).toEqual(['displayName', 'photos', 'startDate', 'stops', 'title', 'tripLengthDays'])
    expect(body.title).toBe('Dublin weekend')
    expect(body.displayName).toBe('Dublin, Ireland')
    expect(body.startDate).toBe('2026-10-05')
    expect(body.tripLengthDays).toBe(2)
  })

  it('returns stops in itinerary order with only the public fields (no bookingUrl, no trip id)', async () => {
    const { env } = recapEnv()
    const body = (await (await get(env, ACTIVE_TOKEN)).json()) as RecapPayload
    expect(body.stops).toEqual([
      { stopId: SECOND_STOP_ID, day: 2, text: 'Guinness Storehouse', lat: 53.3419, lng: -6.2867, category: 'tourist_attraction' },
      { stopId: STOP_ID, day: 1, text: 'Trinity College', lat: 53.3438, lng: -6.2546, category: null },
    ])
    expect(JSON.stringify(body.stops)).not.toContain('bookingUrl')
  })

  it('returns only this trip’s photos, in the public shape', async () => {
    const { env } = recapEnv()
    const body = (await (await get(env, ACTIVE_TOKEN)).json()) as RecapPayload
    expect(body.photos.map((p) => p.id).sort()).toEqual([PHOTO_ID, SECOND_PHOTO_ID].sort())
    expect(body.photos.map((p) => p.id)).not.toContain(OTHER_PHOTO_ID)
    const photo = body.photos.find((p) => p.id === PHOTO_ID)
    expect(photo).toEqual({ id: PHOTO_ID, stopId: STOP_ID, width: 800, height: 600, createdAt: '2026-10-05T09:30:00.000Z' })
  })

  it('does not leak the trip id through a stop id equal to it, and the stop keeps its photo', async () => {
    const state = defaultRecapState()
    const itinerary = [{ id: TRIP_ID, time: '09:00', text: 'Odd stop', type: 'fixed', day: 1 }]
    state.trips[TRIP_ID] = tripRow(TRIP_ID, itinerary)
    state.photos = [photoRow({ stop_id: TRIP_ID })]
    const { env } = recapEnv(state)
    const res = await get(env, ACTIVE_TOKEN)
    const text = await res.text()
    expect(text).not.toContain(TRIP_ID)
    const body = JSON.parse(text) as RecapPayload
    expect(body.stops[0].stopId).toMatch(UUID_RE)
    expect(body.photos).toHaveLength(1)
    expect(body.photos[0].stopId).toBe(body.stops[0].stopId)
  })

  it('does not leak the trip id through user text (title, stop text, category)', async () => {
    const state = defaultRecapState()
    const pasted = `see /trip/${TRIP_ID.toUpperCase()}`
    const itinerary = [{ id: STOP_ID, time: '09:00', text: `Trinity ${pasted}`, type: 'fixed', day: 1, category: TRIP_ID }]
    state.trips[TRIP_ID] = tripRow(TRIP_ID, itinerary, { title: `My trip ${TRIP_ID}` })
    const { env } = recapEnv(state)
    const text = await (await get(env, ACTIVE_TOKEN)).text()
    expect(text.toLowerCase()).not.toContain(TRIP_ID.toLowerCase())
    const body = JSON.parse(text) as RecapPayload
    expect(body.stops[0].text).toContain('Trinity')
  })

  it('gives a legacy stop without an id a stopId, and drops photos whose stop is gone', async () => {
    const state = defaultRecapState()
    state.trips[TRIP_ID] = tripRow(TRIP_ID, [{ time: '09:00', text: 'Legacy stop', type: 'fixed' }])
    const { env } = recapEnv(state)
    const body = (await (await get(env, ACTIVE_TOKEN)).json()) as RecapPayload
    expect(body.stops).toHaveLength(1)
    expect(body.stops[0]).toMatchObject({ day: 1, text: 'Legacy stop', lat: null, lng: null, category: null })
    expect(body.stops[0].stopId).toMatch(UUID_RE)
    expect(body.photos).toEqual([])
  })

  it('answers 404 for a revoked token', async () => {
    const { env } = recapEnv()
    expect((await get(env, REVOKED_TOKEN)).status).toBe(404)
  })

  it('answers unknown, revoked and malformed tokens with byte-identical 404s', async () => {
    const { env, calls } = recapEnv()
    const unknown = await snapshot(await get(env, UNKNOWN_TOKEN))
    const revoked = await snapshot(await get(env, REVOKED_TOKEN))
    expect(unknown.status).toBe(404)
    expect(revoked).toEqual(unknown)

    const before = calls.length
    const malformed = await snapshot(await get(env, 'short'))
    expect(malformed).toEqual(unknown)
    expect(calls).toHaveLength(before)
  })

  it('answers the same 404 when the link’s trip no longer exists', async () => {
    const state = defaultRecapState()
    delete state.trips[TRIP_ID]
    const { env } = recapEnv(state)
    const gone = await snapshot(await get(env, ACTIVE_TOKEN))
    const unknown = await snapshot(await get(env, UNKNOWN_TOKEN))
    expect(gone).toEqual(unknown)
  })

  it('rate-limits with 429 under the recap-read key at 600 per hour', async () => {
    const state = defaultRecapState()
    state.recentRequests = 600
    const { env, calls } = recapEnv(state)
    const res = await get(env, ACTIVE_TOKEN)
    expect(res.status).toBe(429)
    expect(calls.find((c) => c.sql.includes('FROM request_log'))?.args).toContain('recap-read')
    state.recentRequests = 599
    expect((await get(env, ACTIVE_TOKEN)).status).toBe(200)
  })

  it('answers 500 without the trip id when the database fails', async () => {
    vi.spyOn(logger, 'error').mockImplementation(() => {})
    vi.spyOn(logger, 'warn').mockImplementation(() => {})
    const { env } = recapEnv(defaultRecapState(), { fail: true })
    const res = await get(env, ACTIVE_TOKEN)
    expect(res.status).toBe(500)
    expect(await res.text()).not.toContain(TRIP_ID)
  })
})
