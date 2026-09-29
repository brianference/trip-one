// @vitest-environment node
import { describe, it, expect, vi, afterEach } from 'vitest'
import { onRequestPost, onRequestDelete } from './recap-link'
import { onRequestGet as getRecap } from '../../recap/[token]'
import { recapEnv, defaultRecapState, TRIP_ID, OTHER_TRIP_ID, ACTIVE_TOKEN, type RecapState } from '../../../lib/testRecap'
import { DEMO_TRIP_IDS } from '../../../../src/lib/api/demoIds'
import { logger } from '../../../../src/lib/logger'

const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/
const UNKNOWN_TRIP_ID = 'a1b2c3d4-0000-4000-8000-0000000000ff'

type RecapEnv = ReturnType<typeof recapEnv>['env']

/** Calls a recap-link handler for a trip id. */
function call(handler: typeof onRequestPost | typeof onRequestDelete, env: RecapEnv, tripId: string) {
  return handler({ env, request: new Request(`https://x/api/trips/${tripId}/recap-link`), params: { id: tripId } })
}

/** POSTs and returns the token from the body. */
async function postToken(env: RecapEnv, tripId = TRIP_ID): Promise<string> {
  const res = await call(onRequestPost, env, tripId)
  expect(res.status).toBe(200)
  const body = (await res.json()) as { token: string }
  expect(Object.keys(body)).toEqual(['token'])
  return body.token
}

/** A state where TRIP_ID has no active link yet (only the revoked one). */
function stateWithoutActiveLink(): RecapState {
  const state = defaultRecapState()
  state.links = state.links.filter((l) => l.trip_id !== TRIP_ID || l.revoked_at !== null)
  return state
}

/** Decodes unpadded base64url back into bytes. */
function fromBase64Url(token: string): number[] {
  const b64 = token.replace(/-/g, '+').replace(/_/g, '/') + '='
  return Array.from(atob(b64), (ch) => ch.charCodeAt(0))
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('POST /api/trips/:id/recap-link', () => {
  it('creates a 43-character base64url token from 32 bytes of crypto.getRandomValues', async () => {
    const spy = vi.spyOn(globalThis.crypto, 'getRandomValues')
    const { env, state } = recapEnv(stateWithoutActiveLink())
    const token = await postToken(env)

    expect(token).toMatch(TOKEN_RE)
    const filled = spy.mock.calls.map((c) => c[0]).find((arr) => arr instanceof Uint8Array && arr.byteLength === 32)
    expect(filled).toBeDefined()
    // The token IS those 32 random bytes, not something derived from the trip.
    expect(fromBase64Url(token)).toEqual(Array.from(filled as Uint8Array))
    expect(state.links.filter((l) => l.trip_id === TRIP_ID && l.revoked_at === null).map((l) => l.token)).toEqual([token])
  })

  it('is idempotent: a second POST returns the same token and creates nothing', async () => {
    const { env, state } = recapEnv(stateWithoutActiveLink())
    const first = await postToken(env)
    const second = await postToken(env)
    expect(second).toBe(first)
    expect(state.links.filter((l) => l.trip_id === TRIP_ID && l.revoked_at === null)).toHaveLength(1)
  })

  it('returns the existing active token rather than minting one', async () => {
    const { env } = recapEnv()
    expect(await postToken(env)).toBe(ACTIVE_TOKEN)
  })

  it('after DELETE, the next POST returns a different token and the old one answers 404', async () => {
    const { env } = recapEnv(stateWithoutActiveLink())
    const oldToken = await postToken(env)
    expect((await getRecap({ env, request: new Request('https://x'), params: { token: oldToken } })).status).toBe(200)

    const del = await call(onRequestDelete, env, TRIP_ID)
    expect(del.status).toBe(200)
    expect(await del.json()).toEqual({ ok: true })

    const newToken = await postToken(env)
    expect(newToken).toMatch(TOKEN_RE)
    expect(newToken).not.toBe(oldToken)
    expect((await getRecap({ env, request: new Request('https://x'), params: { token: oldToken } })).status).toBe(404)
    expect((await getRecap({ env, request: new Request('https://x'), params: { token: newToken } })).status).toBe(200)
  })

  it('never returns another trip’s token', async () => {
    const { env } = recapEnv()
    const mine = await postToken(env, TRIP_ID)
    const theirs = await postToken(env, OTHER_TRIP_ID)
    expect(mine).not.toBe(theirs)
  })

  it('answers 404 for an unknown trip and creates nothing', async () => {
    const { env, state } = recapEnv()
    const before = state.links.length
    const res = await call(onRequestPost, env, UNKNOWN_TRIP_ID)
    expect(res.status).toBe(404)
    expect(state.links).toHaveLength(before)
  })

  it('answers 404 for a trip id that is not a uuid without touching the database', async () => {
    const { env, calls } = recapEnv()
    expect((await call(onRequestPost, env, '../../etc')).status).toBe(404)
    expect(calls).toHaveLength(0)
  })

  it('refuses demo trips with 403 and creates nothing', async () => {
    const state = defaultRecapState()
    state.trips[DEMO_TRIP_IDS.dublin] = { ...state.trips[TRIP_ID], id: DEMO_TRIP_IDS.dublin }
    const before = state.links.length
    const { env, calls } = recapEnv(state)
    const res = await call(onRequestPost, env, DEMO_TRIP_IDS.dublin)
    expect(res.status).toBe(403)
    expect(state.links).toHaveLength(before)
    expect(calls.some((c) => c.sql.includes('trip_recap_links'))).toBe(false)
  })

  it('rate-limits with 429 under the recap-link key at 60 per hour and creates nothing', async () => {
    const state = stateWithoutActiveLink()
    state.recentRequests = 60
    const before = state.links.length
    const { env, calls } = recapEnv(state)
    const res = await call(onRequestPost, env, TRIP_ID)
    expect(res.status).toBe(429)
    expect(calls.find((c) => c.sql.includes('FROM request_log'))?.args).toContain('recap-link')
    expect(state.links).toHaveLength(before)

    state.recentRequests = 59
    expect((await call(onRequestPost, env, TRIP_ID)).status).toBe(200)
  })

  it('answers 500 with a message that does not name the trip when the database fails', async () => {
    vi.spyOn(logger, 'error').mockImplementation(() => {})
    vi.spyOn(logger, 'warn').mockImplementation(() => {})
    const { env } = recapEnv(defaultRecapState(), { fail: true })
    const res = await call(onRequestPost, env, TRIP_ID)
    expect(res.status).toBe(500)
    expect(await res.text()).not.toContain(TRIP_ID)
  })
})

describe('DELETE /api/trips/:id/recap-link', () => {
  it('revokes the active link and leaves other trips’ links alone', async () => {
    const { env, state } = recapEnv()
    const res = await call(onRequestDelete, env, TRIP_ID)
    expect(res.status).toBe(200)
    expect(state.links.filter((l) => l.trip_id === TRIP_ID && l.revoked_at === null)).toHaveLength(0)
    expect(state.links.filter((l) => l.trip_id === OTHER_TRIP_ID && l.revoked_at === null)).toHaveLength(1)
  })

  it('is idempotent when there is nothing to revoke', async () => {
    const { env } = recapEnv(stateWithoutActiveLink())
    expect((await call(onRequestDelete, env, TRIP_ID)).status).toBe(200)
  })

  it('answers 404 for an unknown trip', async () => {
    const { env } = recapEnv()
    expect((await call(onRequestDelete, env, UNKNOWN_TRIP_ID)).status).toBe(404)
  })

  it('rate-limits with 429 under the recap-link key and revokes nothing', async () => {
    const state = defaultRecapState()
    state.recentRequests = 60
    const { env, calls } = recapEnv(state)
    const res = await call(onRequestDelete, env, TRIP_ID)
    expect(res.status).toBe(429)
    expect(calls.find((c) => c.sql.includes('FROM request_log'))?.args).toContain('recap-link')
    expect(state.links.find((l) => l.token === ACTIVE_TOKEN)?.revoked_at).toBeNull()
  })
})
