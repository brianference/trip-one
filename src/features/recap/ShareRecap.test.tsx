import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ShareRecap } from './ShareRecap'
import { logger } from '../../lib/logger'

/** Synthetic unit-test values (never rendered in the product). */
const TRIP_ID = '11111111-2222-4333-8444-555555555555'
const TOKEN = 'tok_abcdefghijklmnopqrstuvwxyz012345'

/** Stubs fetch with one JSON response and returns the mock. */
function stubFetch(status: number, body: unknown) {
  const fetchMock = vi.fn().mockResolvedValue({ ok: status >= 200 && status < 300, status, json: async () => body })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

/** Sets (or removes, with undefined) a navigator property for one test. */
function setNavigator(key: 'share' | 'clipboard', value: unknown) {
  Object.defineProperty(navigator, key, { value, configurable: true, writable: true })
}

/** Every URL passed to share() or the clipboard, so tests can assert none is a trip (edit) link. */
function sharedUrls(share: ReturnType<typeof vi.fn> | null, writeText: ReturnType<typeof vi.fn> | null): string[] {
  const fromShare = share ? share.mock.calls.map((call) => (call[0] as { url: string }).url) : []
  const fromClipboard = writeText ? writeText.mock.calls.map((call) => call[0] as string) : []
  return [...fromShare, ...fromClipboard]
}

/** Blocking dialogs the component must never open. */
const promptSpy = vi.fn()
const alertSpy = vi.fn()

beforeEach(() => {
  promptSpy.mockReset()
  alertSpy.mockReset()
  vi.stubGlobal('prompt', promptSpy)
  vi.stubGlobal('alert', alertSpy)
})

afterEach(() => {
  setNavigator('share', undefined)
  setNavigator('clipboard', undefined)
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('ShareRecap', () => {
  it('POSTs recap-link, then shares ${origin}/recap/${token} via navigator.share', async () => {
    const fetchMock = stubFetch(200, { token: TOKEN })
    const share = vi.fn().mockResolvedValue(undefined)
    setNavigator('share', share)

    render(<ShareRecap tripId={TRIP_ID} tripName="Tokyo, Japan" />)
    fireEvent.click(screen.getByRole('button', { name: 'Share recap' }))

    await waitFor(() => expect(share).toHaveBeenCalledTimes(1))
    expect(fetchMock).toHaveBeenCalledWith(`/api/trips/${TRIP_ID}/recap-link`, { method: 'POST' })
    expect(share.mock.calls[0][0]).toMatchObject({ url: `${window.location.origin}/recap/${TOKEN}` })
    for (const url of sharedUrls(share, null)) {
      expect(url).not.toContain('/trip/')
      expect(url).not.toContain(TRIP_ID)
    }
  })

  it('falls back to the clipboard when navigator.share is unavailable', async () => {
    stubFetch(200, { token: TOKEN })
    const writeText = vi.fn().mockResolvedValue(undefined)
    setNavigator('clipboard', { writeText })

    render(<ShareRecap tripId={TRIP_ID} tripName="Tokyo, Japan" />)
    fireEvent.click(screen.getByRole('button', { name: 'Share recap' }))

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/recap/${TOKEN}`))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Recap link copied'))
    for (const url of sharedUrls(null, writeText)) expect(url).not.toContain('/trip/')
  })

  it('falls back to the clipboard when navigator.share fails for a reason other than the user cancelling', async () => {
    stubFetch(200, { token: TOKEN })
    const share = vi.fn().mockRejectedValue(new DOMException('not allowed', 'NotAllowedError'))
    const writeText = vi.fn().mockResolvedValue(undefined)
    setNavigator('share', share)
    setNavigator('clipboard', { writeText })

    render(<ShareRecap tripId={TRIP_ID} tripName="Tokyo, Japan" />)
    fireEvent.click(screen.getByRole('button', { name: 'Share recap' }))

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1))
    for (const url of sharedUrls(share, writeText)) expect(url).not.toContain('/trip/')
  })

  it('does nothing more when the user cancels the share sheet', async () => {
    stubFetch(200, { token: TOKEN })
    const share = vi.fn().mockRejectedValue(new DOMException('cancelled', 'AbortError'))
    const writeText = vi.fn().mockResolvedValue(undefined)
    setNavigator('share', share)
    setNavigator('clipboard', { writeText })

    render(<ShareRecap tripId={TRIP_ID} tripName="Tokyo, Japan" />)
    fireEvent.click(screen.getByRole('button', { name: 'Share recap' }))

    await waitFor(() => expect(share).toHaveBeenCalledTimes(1))
    expect(writeText).not.toHaveBeenCalled()
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  it('shows the link in a read-only input when neither share nor the clipboard works, never a dialog', async () => {
    stubFetch(200, { token: TOKEN })
    setNavigator('clipboard', { writeText: vi.fn().mockRejectedValue(new Error('denied')) })

    render(<ShareRecap tripId={TRIP_ID} tripName="Tokyo, Japan" />)
    fireEvent.click(screen.getByRole('button', { name: 'Share recap' }))

    const input = await screen.findByRole('textbox', { name: 'Recap link' })
    expect(input).toHaveValue(`${window.location.origin}/recap/${TOKEN}`)
    expect(input).toHaveAttribute('readonly')
    expect((input as HTMLInputElement).value).not.toContain('/trip/')
    expect(promptSpy).not.toHaveBeenCalled()
    expect(alertSpy).not.toHaveBeenCalled()
  })

  it("shows the server's own error text when the link can't be created", async () => {
    stubFetch(403, { error: "Demo trips can't be shared as a recap. Start your own trip to share one." })
    const share = vi.fn()
    setNavigator('share', share)
    const logSpy = vi.spyOn(logger, 'error').mockImplementation(() => undefined)

    render(<ShareRecap tripId={TRIP_ID} tripName="Tokyo, Japan" />)
    fireEvent.click(screen.getByRole('button', { name: 'Share recap' }))

    expect(await screen.findByRole('alert')).toHaveTextContent("Demo trips can't be shared as a recap.")
    expect(share).not.toHaveBeenCalled()
    expect(logSpy).toHaveBeenCalledTimes(1)
  })
})
