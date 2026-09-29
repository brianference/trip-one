import { describe, it, expect, vi, afterEach } from 'vitest'
import { uploadStopPhoto, listTripPhotos, deleteTripPhoto, tripPhotoUrl } from './photosApi'

describe('photosApi', () => {
  afterEach(() => vi.restoreAllMocks())

  it('uploads a FormData body holding file, stop_id, width and height', async () => {
    const photo = { id: 'p1', stopId: 'stop-1', width: 1600, height: 1200, createdAt: '2026-09-29T00:00:00.000Z' }
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 201, json: async () => photo })
    vi.stubGlobal('fetch', fetchMock)
    const blob = new Blob(['x'], { type: 'image/jpeg' })

    const result = await uploadStopPhoto('trip-1', 'stop-1', { blob, width: 1600, height: 1200 })

    expect(result).toEqual(photo)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/trips/trip-1/photos')
    expect(init.method).toBe('POST')
    const body = init.body as FormData
    expect(body.get('file')).toBeInstanceOf(Blob)
    expect(body.get('stop_id')).toBe('stop-1')
    expect(body.get('width')).toBe('1600')
    expect(body.get('height')).toBe('1200')
  })

  it('surfaces the server error text on a 409 (stop or trip full)', async () => {
    const message = 'This stop already has 6 photos. Remove one to add another.'
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 409, json: async () => ({ error: message }) }),
    )
    const blob = new Blob(['x'], { type: 'image/jpeg' })

    await expect(uploadStopPhoto('trip-1', 'stop-1', { blob, width: 800, height: 600 })).rejects.toThrow(message)
  })

  it('lists a trip photos', async () => {
    const photos = [{ id: 'p1', stopId: 'stop-1', width: 800, height: 600, createdAt: '2026-09-29T00:00:00.000Z' }]
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ photos }) }))

    const result = await listTripPhotos('trip-1')

    expect(result).toEqual(photos)
  })

  it('surfaces the server error text on a failed list', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({ error: "We couldn't find that trip." }) }),
    )

    await expect(listTripPhotos('missing')).rejects.toThrow("We couldn't find that trip.")
  })

  it('deletes a photo', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) })
    vi.stubGlobal('fetch', fetchMock)

    await deleteTripPhoto('trip-1', 'p1')

    expect(fetchMock).toHaveBeenCalledWith('/api/trips/trip-1/photos/p1', { method: 'DELETE' })
  })

  it('surfaces the server error text on a failed delete', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({ error: "We couldn't find that photo." }) }),
    )

    await expect(deleteTripPhoto('trip-1', 'missing')).rejects.toThrow("We couldn't find that photo.")
  })

  it('builds the photo bytes URL', () => {
    expect(tripPhotoUrl('trip-1', 'p1')).toBe('/api/trips/trip-1/photos/p1')
  })
})
