import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useTripPhotos } from './useTripPhotos'
import * as photosApi from './photosApi'
import * as resizeModule from './resizeImage'

describe('useTripPhotos', () => {
  afterEach(() => vi.restoreAllMocks())

  it('groups loaded photos by stop id', async () => {
    vi.spyOn(photosApi, 'listTripPhotos').mockResolvedValue([
      { id: 'p1', stopId: 'stop-1', width: 800, height: 600, createdAt: 't1' },
      { id: 'p2', stopId: 'stop-1', width: 800, height: 600, createdAt: 't2' },
      { id: 'p3', stopId: 'stop-2', width: 800, height: 600, createdAt: 't3' },
    ])

    const { result } = renderHook(() => useTripPhotos('trip-1'))

    await waitFor(() => expect(result.current.byStop.size).toBe(2))
    expect(result.current.byStop.get('stop-1')).toHaveLength(2)
    expect(result.current.byStop.get('stop-2')).toHaveLength(1)
  })

  it('adds an uploaded photo to its stop and clears uploading', async () => {
    // A pre-existing stop-0 photo from the initial load lets the test wait
    // for that load to settle before uploading, rather than racing it.
    vi.spyOn(photosApi, 'listTripPhotos').mockResolvedValue([
      { id: 'existing', stopId: 'stop-0', width: 100, height: 100, createdAt: 't0' },
    ])
    vi.spyOn(resizeModule, 'resizeImage').mockResolvedValue({ blob: new Blob(['x']), width: 800, height: 600 })
    const uploaded = { id: 'p1', stopId: 'stop-1', width: 800, height: 600, createdAt: 't1' }
    const uploadSpy = vi.spyOn(photosApi, 'uploadStopPhoto').mockResolvedValue(uploaded)

    const { result } = renderHook(() => useTripPhotos('trip-1'))
    await waitFor(() => expect(result.current.byStop.has('stop-0')).toBe(true))

    const file = new File(['x'], 'photo.jpg', { type: 'image/jpeg' })
    await act(async () => {
      await result.current.upload('stop-1', file)
    })

    expect(uploadSpy).toHaveBeenCalledWith('trip-1', 'stop-1', { blob: expect.any(Blob), width: 800, height: 600 })
    expect(result.current.byStop.get('stop-1')).toEqual([uploaded])
    expect(result.current.uploading.has('stop-1')).toBe(false)
    expect(result.current.error).toBeNull()
  })

  it('sets error and clears uploading when an upload fails', async () => {
    vi.spyOn(photosApi, 'listTripPhotos').mockResolvedValue([])
    vi.spyOn(resizeModule, 'resizeImage').mockResolvedValue({ blob: new Blob(['x']), width: 800, height: 600 })
    const message = 'This stop already has 6 photos. Remove one to add another.'
    vi.spyOn(photosApi, 'uploadStopPhoto').mockRejectedValue(new Error(message))

    const { result } = renderHook(() => useTripPhotos('trip-1'))
    const file = new File(['x'], 'photo.jpg', { type: 'image/jpeg' })

    await act(async () => {
      await result.current.upload('stop-1', file)
    })

    expect(result.current.error).toBe(message)
    expect(result.current.uploading.has('stop-1')).toBe(false)
    expect(result.current.byStop.get('stop-1')).toBeUndefined()
  })

  it('removes a photo from its stop', async () => {
    vi.spyOn(photosApi, 'listTripPhotos').mockResolvedValue([
      { id: 'p1', stopId: 'stop-1', width: 800, height: 600, createdAt: 't1' },
      { id: 'p2', stopId: 'stop-1', width: 800, height: 600, createdAt: 't2' },
    ])
    const deleteSpy = vi.spyOn(photosApi, 'deleteTripPhoto').mockResolvedValue(undefined)

    const { result } = renderHook(() => useTripPhotos('trip-1'))
    await waitFor(() => expect(result.current.byStop.get('stop-1')).toHaveLength(2))

    await act(async () => {
      await result.current.remove('p1')
    })

    expect(deleteSpy).toHaveBeenCalledWith('trip-1', 'p1')
    expect(result.current.byStop.get('stop-1')?.map((p) => p.id)).toEqual(['p2'])
  })

  it('clears a stale error and the previous trip\'s photos when tripId changes to one that loads successfully', async () => {
    const listSpy = vi.spyOn(photosApi, 'listTripPhotos')
    listSpy.mockRejectedValueOnce(new Error("We couldn't find that trip."))
    listSpy.mockResolvedValueOnce([{ id: 'pB', stopId: 'stop-b', width: 800, height: 600, createdAt: 'tb' }])

    const { result, rerender } = renderHook(({ tripId }) => useTripPhotos(tripId), {
      initialProps: { tripId: 'trip-A' },
    })

    await waitFor(() => expect(result.current.error).toBe("We couldn't find that trip."))

    rerender({ tripId: 'trip-B' })

    // Reset happens synchronously at the top of the load effect, before
    // trip-B's fetch has even resolved — the stale error and any previous
    // trip's photos must not survive even momentarily under the new tripId.
    expect(result.current.error).toBeNull()
    expect(result.current.byStop.size).toBe(0)

    await waitFor(() => expect(result.current.byStop.has('stop-b')).toBe(true))
    expect(result.current.error).toBeNull()
    expect(result.current.byStop.size).toBe(1)
    expect(result.current.byStop.get('stop-b')).toEqual([
      { id: 'pB', stopId: 'stop-b', width: 800, height: 600, createdAt: 'tb' },
    ])
    // trip-A's stop must never show up under trip-B.
    expect(result.current.byStop.has('stop-a')).toBe(false)
  })
})
