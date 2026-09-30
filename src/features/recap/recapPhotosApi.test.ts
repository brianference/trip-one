import { describe, it, expect, vi, afterEach } from 'vitest'
import { deleteRecapPhoto, fetchRecapMembership, uploadRecapPhoto } from './recapPhotosApi'

/** Synthetic unit-test values. */
const TOKEN = 'tok_abcdefghijklmnopqrstuvwxyz012345'
const STOP = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const PHOTO = '22222222-2222-4222-8222-222222222222'

/** Stubs fetch with one response. */
function reply(status: number, body: unknown) {
  const fetchMock = vi.fn(async () => ({ ok: status >= 200 && status < 300, status, json: async () => body }))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

afterEach(() => vi.unstubAllGlobals())

describe('fetchRecapMembership', () => {
  it('reads member: true as member, and anything else as not-member', async () => {
    const fetchMock = reply(200, { member: true, userId: 'u1' })
    expect(await fetchRecapMembership(TOKEN)).toBe('member')
    expect(fetchMock).toHaveBeenCalledWith(`/api/recap/${TOKEN}/me`, { credentials: 'same-origin' })
    reply(200, { member: false, userId: 'u1' })
    expect(await fetchRecapMembership(TOKEN)).toBe('not-member')
    reply(200, { member: false })
    expect(await fetchRecapMembership(TOKEN)).toBe('not-member')
  })

  it("throws the server's text for an inactive link", async () => {
    reply(404, { error: 'This recap link isn’t active anymore.' })
    await expect(fetchRecapMembership(TOKEN)).rejects.toThrow('This recap link isn’t active anymore.')
  })
})

describe('uploadRecapPhoto', () => {
  it('POSTs the multipart form to the recap-token route with the public stop id', async () => {
    const stored = { id: PHOTO, stopId: STOP, width: 800, height: 600, createdAt: '2026-09-29T00:00:00Z', mine: true }
    const fetchMock = reply(201, stored)
    const blob = new Blob(['jpeg'], { type: 'image/jpeg' })
    expect(await uploadRecapPhoto(TOKEN, STOP, { blob, width: 800, height: 600 })).toEqual(stored)
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`/api/recap/${TOKEN}/photos`)
    expect(init.method).toBe('POST')
    const form = init.body as FormData
    expect(form.get('file')).toBeInstanceOf(Blob)
    expect(form.get('stop_id')).toBe(STOP)
    expect(form.get('width')).toBe('800')
    expect(form.get('height')).toBe('600')
  })

  it("throws the server's text when refused", async () => {
    reply(401, { error: 'Sign in first' })
    await expect(uploadRecapPhoto(TOKEN, STOP, { blob: new Blob(['x']), width: 1, height: 1 })).rejects.toThrow('Sign in first')
  })
})

describe('deleteRecapPhoto', () => {
  it('DELETEs the photo through the recap-token route', async () => {
    const fetchMock = reply(200, { ok: true })
    await deleteRecapPhoto(TOKEN, PHOTO)
    expect(fetchMock).toHaveBeenCalledWith(`/api/recap/${TOKEN}/photos/${PHOTO}`, {
      method: 'DELETE',
      credentials: 'same-origin',
    })
  })

  it("throws the server's text for someone else's photo", async () => {
    reply(403, { error: 'Only the trip’s members can do that.' })
    await expect(deleteRecapPhoto(TOKEN, PHOTO)).rejects.toThrow('Only the trip’s members can do that.')
  })
})
