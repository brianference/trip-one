import { describe, it, expect, vi, afterEach } from 'vitest'
import { listTripInvites, sendTripInvite, revokeTripInvite } from './invitesApi'

describe('invitesApi', () => {
  afterEach(() => vi.restoreAllMocks())

  it('lists a trip invites', async () => {
    const invites = [{ id: 'i1', email: 'a@example.com', createdAt: 1, acceptedAt: null }]
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ invites }) }))

    const result = await listTripInvites('trip-1')

    expect(result).toEqual(invites)
  })

  it('surfaces the server error text on a failed list', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({ error: "We couldn't find that trip." }) }),
    )

    await expect(listTripInvites('missing')).rejects.toThrow("We couldn't find that trip.")
  })

  it('falls back to its own message when an error body is not JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
        json: async () => {
          throw new SyntaxError('Unexpected token < in JSON at position 0')
        },
      }),
    )

    await expect(listTripInvites('trip-1')).rejects.toThrow('failed to load invites')
  })

  it('posts the email as JSON and returns the invite plus emailSent', async () => {
    const invite = { id: 'i1', email: 'a@example.com', createdAt: 1, acceptedAt: null }
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ invite, emailSent: true }) })
    vi.stubGlobal('fetch', fetchMock)

    const result = await sendTripInvite('trip-1', 'a@example.com')

    expect(result).toEqual({ invite, emailSent: true })
    expect(fetchMock).toHaveBeenCalledWith('/api/trips/trip-1/invites', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'a@example.com' }),
    })
  })

  it('returns emailSent: false with a reason when the send was capped', async () => {
    const invite = { id: 'i1', email: 'a@example.com', createdAt: 1, acceptedAt: null }
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ invite, emailSent: false, reason: 'daily_limit' }) }),
    )

    const result = await sendTripInvite('trip-1', 'a@example.com')

    expect(result).toEqual({ invite, emailSent: false, reason: 'daily_limit' })
  })

  it('surfaces the server error text on a refused send (409 live-invite cap)', async () => {
    const message = 'This trip already has 50 open invites. Remove one to invite someone new.'
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 409, json: async () => ({ error: message }) }))

    await expect(sendTripInvite('trip-1', 'a@example.com')).rejects.toThrow(message)
  })

  it('revokes a pending invite', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) })
    vi.stubGlobal('fetch', fetchMock)

    const result = await revokeTripInvite('trip-1', 'i1')

    expect(result).toEqual({ ok: true })
    expect(fetchMock).toHaveBeenCalledWith('/api/trips/trip-1/invites/i1', { method: 'DELETE' })
  })

  it('reports alreadyJoined for an accepted invite, not revoked', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, alreadyJoined: true }) }))

    const result = await revokeTripInvite('trip-1', 'i1')

    expect(result).toEqual({ ok: true, alreadyJoined: true })
  })

  it('surfaces the server error text on a failed revoke', async () => {
    const message = "We couldn't find that invite. It may have been removed."
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({ error: message }) }))

    await expect(revokeTripInvite('trip-1', 'missing')).rejects.toThrow(message)
  })
})
