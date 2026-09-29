import { describe, it, expect, vi, afterEach } from 'vitest'
import { joinRecapTrip, maskEmail, JOIN_FAILED_MESSAGE } from './joinApi'

/** Synthetic unit-test values. */
const TOKEN = 'tok_abcdefghijklmnopqrstuvwxyz012345'
const TRIP_ID = '11111111-2222-4333-8444-555555555555'

/** Stubs fetch with one response. */
function reply(status: number, body: unknown) {
  const fetchMock = vi.fn(async () => ({ ok: status >= 200 && status < 300, status, json: async () => body }))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

afterEach(() => vi.unstubAllGlobals())

describe('maskEmail', () => {
  it('keeps only the first character of the local part', () => {
    expect(maskEmail('bea@example.com')).toBe('b•••@example.com')
    expect(maskEmail('  alexandra.long@example.com ')).toBe('a•••@example.com')
  })

  it('leaves something that is not an address alone', () => {
    expect(maskEmail('nope')).toBe('nope')
    expect(maskEmail('@example.com')).toBe('@example.com')
  })
})

describe('joinRecapTrip', () => {
  it('POSTs to the token join route and returns the trip id on 200', async () => {
    const fetchMock = reply(200, { tripId: TRIP_ID })
    expect(await joinRecapTrip(TOKEN)).toEqual({ kind: 'joined', tripId: TRIP_ID })
    expect(fetchMock).toHaveBeenCalledWith(`/api/recap/${TOKEN}/join`, expect.objectContaining({ method: 'POST' }))
  })

  it('maps 401 and 403 to their states', async () => {
    reply(401, { error: 'Sign in first' })
    expect(await joinRecapTrip(TOKEN)).toEqual({ kind: 'signed-out' })
    reply(403, { error: "This email isn't invited to this trip." })
    expect(await joinRecapTrip(TOKEN)).toEqual({ kind: 'not-invited' })
  })

  it("shows the server's text for other failures and a fallback when there is none", async () => {
    reply(404, { error: 'This recap link isn’t active anymore.' })
    expect(await joinRecapTrip(TOKEN)).toEqual({ kind: 'failed', message: 'This recap link isn’t active anymore.' })
    reply(200, {})
    expect(await joinRecapTrip(TOKEN)).toEqual({ kind: 'failed', message: JOIN_FAILED_MESSAGE })
  })

  it('reports a network failure without throwing', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('offline'))))
    expect(await joinRecapTrip(TOKEN)).toEqual({
      kind: 'failed',
      message: 'Could not reach the server. Check your connection and try again.',
    })
  })
})
