import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import type { RecapPayload } from './types'
import type { AuthUser } from '../auth/AuthContext'
import { AuthProvider } from '../auth/AuthContext'
import * as resizeModule from '../photos/resizeImage'

vi.mock('./RecapMap', () => ({ RecapMap: () => <div data-testid="recap-map" /> }))

import { RecapPublicPage } from './RecapPublicPage'

/** Synthetic unit-test values (never rendered in the product). */
const TOKEN = 'tok_abcdefghijklmnopqrstuvwxyz012345'
const STOP_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const STOP_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const OWNER_PHOTO = '11111111-1111-4111-8111-111111111111'
const MY_PHOTO = '22222222-2222-4222-8222-222222222222'
const NEW_PHOTO = '33333333-3333-4333-8333-333333333333'
const member: AuthUser = { id: 'u-bea', email: 'bea@example.com', displayName: 'bea', emailVerified: true }

/** The recap as the server would send it to this member: their own photo marked `mine`. */
function basePayload(): RecapPayload {
  return {
    title: 'Autumn in Oslo',
    displayName: 'Oslo, Norway',
    startDate: '2026-09-01',
    tripLengthDays: 2,
    stops: [
      { stopId: STOP_A, day: 1, text: 'Vigeland Park', lat: 59.927, lng: 10.7, category: null },
      // A legacy stop the server could not pass an id through for: not offered.
      { stopId: 'stop-1', day: 1, text: 'Legacy stop', lat: null, lng: null, category: null },
      { stopId: STOP_B, day: 2, text: 'Oslo Opera House', lat: 59.907, lng: 10.753, category: null },
    ],
    photos: [
      { id: OWNER_PHOTO, stopId: STOP_A, width: 1600, height: 1200, createdAt: '2026-09-01T10:00:00Z' },
      { id: MY_PHOTO, stopId: STOP_A, width: 1600, height: 1200, createdAt: '2026-09-01T11:00:00Z', mine: true },
    ],
  }
}

interface Api {
  me: AuthUser | null
  membership: { status: number; body: unknown }
  payload: RecapPayload
  upload: { status: number; body: unknown }
  remove: { status: number; body: unknown }
  join: { status: number; body: unknown }
}

/**
 * A small in-memory server for the recap routes: an upload adds to the
 * payload and a delete takes out, so the page's reload shows the change.
 */
function stubApi(overrides: Partial<Api> = {}) {
  const api: Api = {
    me: member,
    membership: { status: 200, body: { member: true, userId: member.id } },
    payload: basePayload(),
    upload: {
      status: 201,
      body: { id: NEW_PHOTO, stopId: STOP_B, width: 800, height: 600, createdAt: '2026-09-02T09:00:00Z', mine: true },
    },
    remove: { status: 200, body: { ok: true } },
    join: { status: 200, body: { joined: true } },
    ...overrides,
  }
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    let reply: { status: number; body: unknown }
    if (url === '/api/auth/me') reply = { status: 200, body: { user: api.me } }
    else if (url === `/api/recap/${TOKEN}` && method === 'GET') reply = { status: 200, body: api.payload }
    else if (url === `/api/recap/${TOKEN}/me`) reply = api.membership
    else if (url === `/api/recap/${TOKEN}/join` && method === 'POST') reply = api.join
    else if (url === `/api/recap/${TOKEN}/photos` && method === 'POST') {
      reply = api.upload
      if (reply.status === 201) api.payload = { ...api.payload, photos: [...api.payload.photos, reply.body as RecapPayload['photos'][number]] }
    } else if (url.startsWith(`/api/recap/${TOKEN}/photos/`) && method === 'DELETE') {
      reply = api.remove
      const photoId = url.slice(url.lastIndexOf('/') + 1)
      if (reply.status === 200) api.payload = { ...api.payload, photos: api.payload.photos.filter((p) => p.id !== photoId) }
    } else throw new Error(`unexpected fetch ${method} ${url}`)
    return { ok: reply.status >= 200 && reply.status < 300, status: reply.status, json: async () => reply.body }
  })
  vi.stubGlobal('fetch', fetchMock)
  return { fetchMock, api }
}

/** Calls made with one method to one URL. */
function callsTo(fetchMock: ReturnType<typeof stubApi>['fetchMock'], method: string, url: string) {
  return fetchMock.mock.calls.filter(([called, init]) => called === url && (init?.method ?? 'GET') === method)
}

/** Shows the current path and query. */
function LocationProbe() {
  const location = useLocation()
  return <p data-testid="location">{location.pathname + location.search}</p>
}

/** Renders the public recap route. */
function renderPage(query = '') {
  return render(
    <MemoryRouter initialEntries={[`/recap/${TOKEN}${query}`]}>
      <AuthProvider>
        <Routes>
          <Route path="/recap/:token" element={<RecapPublicPage />} />
        </Routes>
        <LocationProbe />
      </AuthProvider>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  )
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('RecapPublicPage contributor mode', () => {
  it('a member sees the contributor banner, not the join banner, and a remove control on their own photo only', async () => {
    stubApi()
    renderPage()
    const banner = await screen.findByRole('region', { name: 'You’re on this trip' })
    expect(within(banner).getByRole('button', { name: 'Add photos' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Were you on this trip?' })).toBeNull()
    const strip = screen.getByRole('list', { name: 'Photos at Vigeland Park' })
    expect(within(strip).getAllByRole('img')).toHaveLength(2)
    expect(within(strip).queryByRole('button', { name: 'Remove photo 1 of 2 at Vigeland Park' })).toBeNull()
    expect(within(strip).getByRole('button', { name: 'Remove photo 2 of 2 at Vigeland Park' })).toBeInTheDocument()
    for (const img of within(strip).getAllByRole('img')) {
      expect(img.getAttribute('src')).toMatch(new RegExp(`^/api/recap/${TOKEN}/photos/`))
    }
  })

  it('"Add photos" lists only stops with an id, resizes the file and uploads it through the recap route, then reloads', async () => {
    const resizeSpy = vi
      .spyOn(resizeModule, 'resizeImage')
      .mockResolvedValue({ blob: new Blob(['jpeg']), width: 800, height: 600 })
    const { fetchMock } = stubApi()
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Add photos' }))
    const dialog = screen.getByRole('dialog', { name: 'Which stop is this photo for?' })
    expect(within(dialog).getByRole('radio', { name: 'Vigeland Park' })).toBeChecked()
    expect(within(dialog).getByRole('radio', { name: 'Oslo Opera House' })).toBeInTheDocument()
    expect(within(dialog).queryByRole('radio', { name: 'Legacy stop' })).toBeNull()

    fireEvent.click(within(dialog).getByRole('radio', { name: 'Oslo Opera House' }))
    const file = new File(['bytes'], 'og.png', { type: 'image/png' })
    fireEvent.change(dialog.querySelector('input[type="file"]') as HTMLInputElement, { target: { files: [file] } })

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Photo added to Oslo Opera House'))
    expect(resizeSpy).toHaveBeenCalledWith(file)
    const [[, init]] = callsTo(fetchMock, 'POST', `/api/recap/${TOKEN}/photos`)
    const form = init?.body as FormData
    expect(form.get('stop_id')).toBe(STOP_B)
    expect(form.get('width')).toBe('800')
    expect(form.get('height')).toBe('600')
    // Loaded once on arrival, once after the upload.
    expect(callsTo(fetchMock, 'GET', `/api/recap/${TOKEN}`)).toHaveLength(2)
    const strip = await screen.findByRole('list', { name: 'Photos at Oslo Opera House' })
    expect(within(strip).getByRole('button', { name: 'Remove photo 1 of 1 at Oslo Opera House' })).toBeInTheDocument()
  })

  it('removing their own photo confirms inline, deletes through the recap route, and reloads without it', async () => {
    const { fetchMock } = stubApi()
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Remove photo 2 of 2 at Vigeland Park' }))
    expect(screen.getByText('Remove this photo?')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Photo removed'))
    expect(callsTo(fetchMock, 'DELETE', `/api/recap/${TOKEN}/photos/${MY_PHOTO}`)).toHaveLength(1)
    const strip = await screen.findByRole('list', { name: 'Photos at Vigeland Park' })
    await waitFor(() => expect(within(strip).getAllByRole('img')).toHaveLength(1))
    expect(within(strip).queryByRole('button', { name: /Remove photo/ })).toBeNull()
  })

  it('a refused delete shows the server text in an alert', async () => {
    const message = 'Only the trip’s members can do that.'
    vi.spyOn(console, 'error').mockImplementation(() => {})
    stubApi({ remove: { status: 403, body: { error: message } } })
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Remove photo 2 of 2 at Vigeland Park' }))
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(message)
  })

  it('a refused upload shows the server text in an alert', async () => {
    const message = 'This stop already has 6 photos. Remove one to add another.'
    vi.spyOn(resizeModule, 'resizeImage').mockResolvedValue({ blob: new Blob(['jpeg']), width: 800, height: 600 })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    stubApi({ upload: { status: 409, body: { error: message } } })
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Add photos' }))
    const dialog = screen.getByRole('dialog', { name: 'Which stop is this photo for?' })
    fireEvent.change(dialog.querySelector('input[type="file"]') as HTMLInputElement, {
      target: { files: [new File(['b'], 'a.jpg', { type: 'image/jpeg' })] },
    })
    expect(await screen.findByRole('alert')).toHaveTextContent(message)
  })

  it('a signed-in, verified invitee who is not a member yet joins from "Add photos" and lands in contributor mode with the stop picker open', async () => {
    const { fetchMock } = stubApi({ membership: { status: 200, body: { member: false, userId: member.id } } })
    renderPage()
    const joinBanner = await screen.findByRole('region', { name: 'Were you on this trip?' })
    // Only the member's own photos ever get a remove control: none before joining.
    expect(screen.queryByRole('button', { name: /Remove photo/ })).toBeNull()
    fireEvent.click(within(joinBanner).getByRole('button', { name: 'Add photos' }))
    expect(await screen.findByRole('dialog', { name: 'Which stop is this photo for?' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'You’re on this trip' })).toBeInTheDocument()
    expect(callsTo(fetchMock, 'POST', `/api/recap/${TOKEN}/join`)).toHaveLength(1)
    expect(screen.getByTestId('location')).toHaveTextContent(`/recap/${TOKEN}`)
    expect(document.body.innerHTML).not.toContain('/trip/')
  })

  it('a signed-out viewer gets the join banner and no remove controls', async () => {
    stubApi({ me: null, membership: { status: 200, body: { member: false } } })
    renderPage()
    expect(await screen.findByRole('region', { name: 'Were you on this trip?' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'You’re on this trip' })).toBeNull()
    expect(screen.queryByRole('button', { name: /Remove photo/ })).toBeNull()
  })

  it('a member arriving from an invite link has ?invite=1 cleared and no join sheet opened', async () => {
    const { fetchMock } = stubApi()
    renderPage('?invite=1')
    await screen.findByRole('region', { name: 'You’re on this trip' })
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(new RegExp(`^/recap/${TOKEN}$`)))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(callsTo(fetchMock, 'POST', `/api/recap/${TOKEN}/join`)).toHaveLength(0)
  })

  it('does not announce "Photo added" when the reload after the upload fails', async () => {
    vi.spyOn(resizeModule, 'resizeImage').mockResolvedValue({ blob: new Blob(['jpeg']), width: 800, height: 600 })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { fetchMock } = stubApi()
    let recapGets = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url === `/api/recap/${TOKEN}` && (init?.method ?? 'GET') === 'GET' && ++recapGets > 1) {
          return { ok: false, status: 500, json: async () => ({ error: 'down' }) }
        }
        return fetchMock(url, init)
      }),
    )
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Add photos' }))
    const dialog = screen.getByRole('dialog', { name: 'Which stop is this photo for?' })
    const file = new File(['bytes'], 'og.png', { type: 'image/png' })
    fireEvent.change(dialog.querySelector('input[type="file"]') as HTMLInputElement, { target: { files: [file] } })
    expect(await screen.findByRole('alert')).toHaveTextContent('Saved, but we couldn’t refresh the page')
    expect(screen.queryByText(/Photo added to/)).toBeNull()
  })

  it('a failed upload re-checks membership, and a lapsed member drops back to the join banner', async () => {
    vi.spyOn(resizeModule, 'resizeImage').mockResolvedValue({ blob: new Blob(['jpeg']), width: 800, height: 600 })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { fetchMock, api } = stubApi({ upload: { status: 401, body: { error: 'Sign in to add photos.' } } })
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Add photos' }))
    // The session lapses after the page loaded.
    api.membership = { status: 200, body: { member: false } }
    const dialog = screen.getByRole('dialog', { name: 'Which stop is this photo for?' })
    const file = new File(['bytes'], 'og.png', { type: 'image/png' })
    fireEvent.change(dialog.querySelector('input[type="file"]') as HTMLInputElement, { target: { files: [file] } })
    expect(await screen.findByRole('region', { name: 'Were you on this trip?' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'You’re on this trip' })).toBeNull()
    expect(callsTo(fetchMock, 'GET', `/api/recap/${TOKEN}/me`).length).toBeGreaterThanOrEqual(2)
  })

  it('offers no "Add photos" button when the recap has no stops a contributor can use', async () => {
    const payload = basePayload()
    payload.stops = [{ stopId: 'stop-1', day: 1, text: 'Legacy stop', lat: null, lng: null, category: null }]
    payload.photos = []
    stubApi({ payload })
    renderPage()
    const banner = await screen.findByRole('region', { name: 'You’re on this trip' })
    expect(within(banner).queryByRole('button', { name: 'Add photos' })).toBeNull()
    expect(within(banner).getByText('This recap has no stops to add photos to yet.')).toBeInTheDocument()
  })

  it('a failed membership re-check leaves a real member in contributor mode', async () => {
    vi.spyOn(resizeModule, 'resizeImage').mockResolvedValue({ blob: new Blob(['jpeg']), width: 800, height: 600 })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { api } = stubApi({ upload: { status: 500, body: { error: 'Storage is down.' } } })
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Add photos' }))
    // The re-check itself fails: that must not demote the member.
    api.membership = { status: 500, body: { error: 'down' } }
    const dialog = screen.getByRole('dialog', { name: 'Which stop is this photo for?' })
    const file = new File(['bytes'], 'og.png', { type: 'image/png' })
    fireEvent.change(dialog.querySelector('input[type="file"]') as HTMLInputElement, { target: { files: [file] } })
    expect(await screen.findByRole('alert')).toHaveTextContent('Storage is down.')
    await waitFor(() => expect(screen.getByRole('region', { name: 'You’re on this trip' })).toBeInTheDocument())
    expect(screen.queryByRole('region', { name: 'Were you on this trip?' })).toBeNull()
  })
})
