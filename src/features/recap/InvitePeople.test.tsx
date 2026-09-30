import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { InvitePeople, REMOVE_ACCESS_CONFIRM } from './InvitePeople'
import { logger } from '../../lib/logger'

/** Synthetic unit-test values (never rendered in the product). */
const TRIP_ID = '11111111-2222-4333-8444-555555555555'

/** Stubs fetch with one JSON response per URL + method, matched by suffix. */
function stubFetch(routes: Record<string, { status: number; body: unknown }>) {
  const fetchMock = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    const key = `${method} ${url}`
    const match = Object.entries(routes).find(([k]) => key.endsWith(k))
    if (!match) throw new Error(`unexpected fetch ${key}`)
    const [, { status, body }] = match
    return { ok: status >= 200 && status < 300, status, json: async () => body }
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('InvitePeople', () => {
  it('shows the section title and explainer, with no invites listed yet', async () => {
    stubFetch({ [`GET /api/trips/${TRIP_ID}/invites`]: { status: 200, body: { invites: [] } } })
    render(<InvitePeople tripId={TRIP_ID} />)

    expect(await screen.findByRole('heading', { name: 'Invite people to add photos' })).toBeInTheDocument()
    expect(
      screen.getByText(
        "They’ll get an email with a link to this recap. After signing in with that email, they can add their photos.",
      ),
    ).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Email' })).toBeInTheDocument()
  })

  it('sends the trimmed email, lists the new invite, and announces success', async () => {
    const invite = { id: 'i1', email: 'friend@example.com', createdAt: 1, acceptedAt: null }
    const fetchMock = stubFetch({
      [`GET /api/trips/${TRIP_ID}/invites`]: { status: 200, body: { invites: [] } },
      [`POST /api/trips/${TRIP_ID}/invites`]: { status: 201, body: { invite, emailSent: true } },
    })
    render(<InvitePeople tripId={TRIP_ID} />)
    await screen.findByRole('heading', { name: 'Invite people to add photos' })

    fireEvent.change(screen.getByRole('textbox', { name: 'Email' }), { target: { value: '  friend@example.com  ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send invite' }))

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Invite sent to friend@example.com.'))
    expect(screen.getByText('friend@example.com')).toBeInTheDocument()
    expect(screen.getByText('Invited')).toBeInTheDocument()
    const postCall = fetchMock.mock.calls.find(
      ([url, init]) => url === `/api/trips/${TRIP_ID}/invites` && (init as RequestInit | undefined)?.method === 'POST',
    )
    expect(postCall?.[1]).toMatchObject({ method: 'POST', body: JSON.stringify({ email: 'friend@example.com' }) })
    // The input clears after a successful send.
    expect(screen.getByRole('textbox', { name: 'Email' })).toHaveValue('')
  })

  it('shows the reason text when the invite is saved but not emailed (daily_limit)', async () => {
    const invite = { id: 'i1', email: 'a@example.com', createdAt: 1, acceptedAt: null }
    stubFetch({
      [`GET /api/trips/${TRIP_ID}/invites`]: { status: 200, body: { invites: [] } },
      [`POST /api/trips/${TRIP_ID}/invites`]: { status: 201, body: { invite, emailSent: false, reason: 'daily_limit' } },
    })
    render(<InvitePeople tripId={TRIP_ID} />)
    await screen.findByRole('heading', { name: 'Invite people to add photos' })

    fireEvent.change(screen.getByRole('textbox', { name: 'Email' }), { target: { value: 'a@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send invite' }))

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(
        "Invite saved, but we didn’t send an email: this person or trip hit today's invite limit, try again tomorrow.",
      ),
    )
  })

  it('shows the reason text when the invite was recently sent', async () => {
    const invite = { id: 'i1', email: 'a@example.com', createdAt: 1, acceptedAt: null }
    stubFetch({
      [`GET /api/trips/${TRIP_ID}/invites`]: { status: 200, body: { invites: [] } },
      [`POST /api/trips/${TRIP_ID}/invites`]: {
        status: 201,
        body: { invite, emailSent: false, reason: 'recently_sent' },
      },
    })
    render(<InvitePeople tripId={TRIP_ID} />)
    await screen.findByRole('heading', { name: 'Invite people to add photos' })

    fireEvent.change(screen.getByRole('textbox', { name: 'Email' }), { target: { value: 'a@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send invite' }))

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(
        'Invite saved, but we didn’t send an email: they were emailed in the last 24 hours.',
      ),
    )
  })

  it("shows the server's error text on a 409 (live-invite cap)", async () => {
    const message = 'This trip already has 50 open invites. Remove one to invite someone new.'
    stubFetch({
      [`GET /api/trips/${TRIP_ID}/invites`]: { status: 200, body: { invites: [] } },
      [`POST /api/trips/${TRIP_ID}/invites`]: { status: 409, body: { error: message } },
    })
    const logSpy = vi.spyOn(logger, 'error').mockImplementation(() => undefined)
    render(<InvitePeople tripId={TRIP_ID} />)
    await screen.findByRole('heading', { name: 'Invite people to add photos' })

    fireEvent.change(screen.getByRole('textbox', { name: 'Email' }), { target: { value: 'a@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send invite' }))

    // A failure is an alert, not a polite status.
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(message))
    expect(screen.getByRole('status')).toHaveTextContent('')
    expect(logSpy).toHaveBeenCalledTimes(1)
    // A failed send keeps the typed email so it isn't lost.
    expect(screen.getByRole('textbox', { name: 'Email' })).toHaveValue('a@example.com')
  })

  it("shows the server's error text on a 429 (rate limited)", async () => {
    const message = 'You’ve made a lot of requests in a short time. Please wait a few minutes and try again.'
    stubFetch({
      [`GET /api/trips/${TRIP_ID}/invites`]: { status: 200, body: { invites: [] } },
      [`POST /api/trips/${TRIP_ID}/invites`]: { status: 429, body: { error: message } },
    })
    vi.spyOn(logger, 'error').mockImplementation(() => undefined)
    render(<InvitePeople tripId={TRIP_ID} />)
    await screen.findByRole('heading', { name: 'Invite people to add photos' })

    fireEvent.change(screen.getByRole('textbox', { name: 'Email' }), { target: { value: 'a@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send invite' }))

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(message))
  })

  it("shows a failed remove's server text in an alert and keeps the confirm open to retry", async () => {
    const message = "We couldn't find that invite. It may have been removed."
    const invites = [{ id: 'i1', email: 'a@example.com', createdAt: 1, acceptedAt: null }]
    stubFetch({
      [`GET /api/trips/${TRIP_ID}/invites`]: { status: 200, body: { invites } },
      [`DELETE /api/trips/${TRIP_ID}/invites/i1`]: { status: 404, body: { error: message } },
    })
    vi.spyOn(logger, 'error').mockImplementation(() => undefined)
    render(<InvitePeople tripId={TRIP_ID} />)

    fireEvent.click(await screen.findByRole('button', { name: 'Remove invite to a@example.com' }))
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(message))
    expect(screen.getByText('a@example.com')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
  })

  it('removes a pending invite after an inline confirm (no window.confirm)', async () => {
    const invites = [{ id: 'i1', email: 'a@example.com', createdAt: 1, acceptedAt: null }]
    const confirmSpy = vi.fn()
    vi.stubGlobal('confirm', confirmSpy)
    stubFetch({
      [`GET /api/trips/${TRIP_ID}/invites`]: { status: 200, body: { invites } },
      [`DELETE /api/trips/${TRIP_ID}/invites/i1`]: { status: 200, body: { ok: true } },
    })
    render(<InvitePeople tripId={TRIP_ID} />)

    const removeBtn = await screen.findByRole('button', { name: 'Remove invite to a@example.com' })
    fireEvent.click(removeBtn)
    expect(confirmSpy).not.toHaveBeenCalled()
    expect(screen.getByText('Remove this invite?')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))

    await waitFor(() => expect(screen.queryByText('a@example.com')).toBeNull())
    expect(screen.getByRole('status')).toHaveTextContent('Invite removed.')
  })

  it('cancelling the inline confirm removes nothing', async () => {
    const invites = [{ id: 'i1', email: 'a@example.com', createdAt: 1, acceptedAt: null }]
    const fetchMock = stubFetch({ [`GET /api/trips/${TRIP_ID}/invites`]: { status: 200, body: { invites } } })
    render(<InvitePeople tripId={TRIP_ID} />)

    fireEvent.click(await screen.findByRole('button', { name: 'Remove invite to a@example.com' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(screen.getByText('a@example.com')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(1) // only the initial GET
  })

  it('a joined person shows "Joined" with a Remove control; confirming removes their access and drops the row', async () => {
    const invites = [
      { id: 'i1', email: 'joined@example.com', createdAt: 1, acceptedAt: 2 },
      { id: 'i2', email: 'b@example.com', createdAt: 3, acceptedAt: null },
    ]
    const fetchMock = stubFetch({
      [`GET /api/trips/${TRIP_ID}/invites`]: { status: 200, body: { invites } },
      [`DELETE /api/trips/${TRIP_ID}/invites/i1`]: { status: 200, body: { ok: true, removedMember: true } },
    })
    render(<InvitePeople tripId={TRIP_ID} />)

    expect(await screen.findByText('joined@example.com')).toBeInTheDocument()
    expect(screen.getByText('Joined')).toBeInTheDocument()
    expect(screen.queryByText(/can’t be removed/)).toBeNull()
    expect(screen.queryByText(/keep access/)).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Remove access for joined@example.com' }))
    expect(screen.getByText(REMOVE_ACCESS_CONFIRM)).toBeInTheDocument()
    expect(REMOVE_ACCESS_CONFIRM).toBe('Remove access? They won’t be able to add photos anymore.')
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus()
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))

    await waitFor(() => expect(screen.queryByText('joined@example.com')).toBeNull())
    expect(screen.getByRole('status')).toHaveTextContent('Access removed.')
    expect(screen.getByRole('button', { name: 'Remove invite to b@example.com' })).toHaveFocus()
    expect(
      fetchMock.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === 'DELETE'),
    ).toHaveLength(1)
  })

  describe('focus management', () => {
    it('opening the inline confirm focuses Cancel', async () => {
      const invites = [{ id: 'i1', email: 'a@example.com', createdAt: 1, acceptedAt: null }]
      stubFetch({ [`GET /api/trips/${TRIP_ID}/invites`]: { status: 200, body: { invites } } })
      render(<InvitePeople tripId={TRIP_ID} />)

      fireEvent.click(await screen.findByRole('button', { name: 'Remove invite to a@example.com' }))

      expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus()
    })

    it('cancelling returns focus to that row’s Remove button', async () => {
      const invites = [{ id: 'i1', email: 'a@example.com', createdAt: 1, acceptedAt: null }]
      stubFetch({ [`GET /api/trips/${TRIP_ID}/invites`]: { status: 200, body: { invites } } })
      render(<InvitePeople tripId={TRIP_ID} />)

      fireEvent.click(await screen.findByRole('button', { name: 'Remove invite to a@example.com' }))
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

      expect(screen.getByRole('button', { name: 'Remove invite to a@example.com' })).toHaveFocus()
    })

    it('removing the only pending invite moves focus to the email input', async () => {
      const invites = [{ id: 'i1', email: 'a@example.com', createdAt: 1, acceptedAt: null }]
      stubFetch({
        [`GET /api/trips/${TRIP_ID}/invites`]: { status: 200, body: { invites } },
        [`DELETE /api/trips/${TRIP_ID}/invites/i1`]: { status: 200, body: { ok: true } },
      })
      render(<InvitePeople tripId={TRIP_ID} />)

      fireEvent.click(await screen.findByRole('button', { name: 'Remove invite to a@example.com' }))
      fireEvent.click(screen.getByRole('button', { name: 'Remove' }))

      await waitFor(() => expect(screen.queryByText('a@example.com')).toBeNull())
      expect(screen.getByRole('textbox', { name: 'Email' })).toHaveFocus()
    })

    it('removing the first of two pending invites moves focus to the next row’s Remove button', async () => {
      const invites = [
        { id: 'i1', email: 'a@example.com', createdAt: 1, acceptedAt: null },
        { id: 'i2', email: 'b@example.com', createdAt: 2, acceptedAt: null },
      ]
      stubFetch({
        [`GET /api/trips/${TRIP_ID}/invites`]: { status: 200, body: { invites } },
        [`DELETE /api/trips/${TRIP_ID}/invites/i1`]: { status: 200, body: { ok: true } },
      })
      render(<InvitePeople tripId={TRIP_ID} />)

      fireEvent.click(await screen.findByRole('button', { name: 'Remove invite to a@example.com' }))
      fireEvent.click(screen.getByRole('button', { name: 'Remove' }))

      await waitFor(() => expect(screen.queryByText('a@example.com')).toBeNull())
      expect(screen.getByRole('button', { name: 'Remove invite to b@example.com' })).toHaveFocus()
    })

    it('removing the last of two pending invites moves focus to the remaining row’s Remove button', async () => {
      const invites = [
        { id: 'i1', email: 'a@example.com', createdAt: 1, acceptedAt: null },
        { id: 'i2', email: 'b@example.com', createdAt: 2, acceptedAt: null },
      ]
      stubFetch({
        [`GET /api/trips/${TRIP_ID}/invites`]: { status: 200, body: { invites } },
        [`DELETE /api/trips/${TRIP_ID}/invites/i2`]: { status: 200, body: { ok: true } },
      })
      render(<InvitePeople tripId={TRIP_ID} />)

      fireEvent.click(await screen.findByRole('button', { name: 'Remove invite to b@example.com' }))
      fireEvent.click(screen.getByRole('button', { name: 'Remove' }))

      await waitFor(() => expect(screen.queryByText('b@example.com')).toBeNull())
      expect(screen.getByRole('button', { name: 'Remove invite to a@example.com' })).toHaveFocus()
    })

    it('a pending invite that was accepted meanwhile (removedMember) is still dropped, and says access was removed', async () => {
      const invites = [{ id: 'i1', email: 'a@example.com', createdAt: 1, acceptedAt: null }]
      stubFetch({
        [`GET /api/trips/${TRIP_ID}/invites`]: { status: 200, body: { invites } },
        [`DELETE /api/trips/${TRIP_ID}/invites/i1`]: { status: 200, body: { ok: true, removedMember: true } },
      })
      render(<InvitePeople tripId={TRIP_ID} />)

      fireEvent.click(await screen.findByRole('button', { name: 'Remove invite to a@example.com' }))
      fireEvent.click(screen.getByRole('button', { name: 'Remove' }))

      await waitFor(() => expect(screen.queryByText('a@example.com')).toBeNull())
      expect(screen.getByRole('status')).toHaveTextContent('Access removed.')
      expect(screen.getByRole('textbox', { name: 'Email' })).toHaveFocus()
    })
  })
})
