// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { onRequestGet, onRequestDelete } from './[photoId]'
import { fakeR2 } from '../../../../lib/testD1'
import { photoEnv, photoRow, TRIP_ID, OTHER_TRIP_ID, PHOTO_ID, PNG_BYTES } from '../../../../lib/testPhotos'

/** Stores `bytes` in a fresh fake bucket under `key`. */
function bucketWith(key: string, bytes: Uint8Array, contentType = 'image/png') {
  const r2 = fakeR2()
  r2.objects.set(key, { bytes: new Uint8Array(bytes), contentType })
  return r2
}

/** Calls a photo handler for (tripId, photoId). */
function call(
  handler: typeof onRequestGet | typeof onRequestDelete,
  env: ReturnType<typeof photoEnv>['env'],
  tripId: string,
  photoId: string,
) {
  return handler({ env, request: new Request('https://x'), params: { id: tripId, photoId } })
}

describe('GET /api/trips/:id/photos/:photoId', () => {
  it('serves the bytes with the DB-recorded content type and a private cache header', async () => {
    const row = photoRow({ content_type: 'image/png', bytes: PNG_BYTES.byteLength })
    // The R2 metadata deliberately disagrees: the response must follow the row.
    const r2 = bucketWith(row.r2_key, PNG_BYTES, 'text/html')
    const { env } = photoEnv({ photos: [row], r2 })
    const res = await call(onRequestGet, env, TRIP_ID, PHOTO_ID)
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('image/png')
    expect(res.headers.get('Cache-Control')).toBe('private, max-age=86400')
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff')
    expect(Array.from(new Uint8Array(await res.arrayBuffer()))).toEqual(Array.from(PNG_BYTES))
  })

  it('answers 404 for a photo id that belongs to a DIFFERENT trip, indistinguishable from a missing one', async () => {
    const foreign = photoRow({ trip_id: OTHER_TRIP_ID })
    const r2 = bucketWith(foreign.r2_key, PNG_BYTES)
    const { env } = photoEnv({ photos: [foreign], r2 })

    const crossTrip = await call(onRequestGet, env, TRIP_ID, PHOTO_ID)
    const missing = await call(onRequestGet, env, TRIP_ID, '9f000000-0000-4000-8000-0000000000ee')
    expect(crossTrip.status).toBe(404)
    expect(crossTrip.headers.get('Content-Type')).toBe('application/json')
    expect(await crossTrip.text()).toBe(await missing.text())

    // The same photo IS served under its own trip, so the 404 above is the scoping, not a broken fixture.
    const own = await call(onRequestGet, env, OTHER_TRIP_ID, PHOTO_ID)
    expect(own.status).toBe(200)
  })

  it('answers 404 when the row exists but the R2 object is gone', async () => {
    const { env } = photoEnv({ photos: [photoRow()] })
    const res = await call(onRequestGet, env, TRIP_ID, PHOTO_ID)
    expect(res.status).toBe(404)
  })

  it('answers 404 for ids that are not uuids without touching the database', async () => {
    const { env, calls } = photoEnv({ photos: [photoRow()] })
    expect((await call(onRequestGet, env, TRIP_ID, '..%2F..%2Fsecret')).status).toBe(404)
    expect((await call(onRequestGet, env, 'not-a-trip', PHOTO_ID)).status).toBe(404)
    expect(calls.some((c) => c.sql.includes('trip_photos'))).toBe(false)
  })

  it('rate-limits reads with 429 under the photos-read key', async () => {
    const row = photoRow()
    const { env, calls } = photoEnv({ photos: [row], r2: bucketWith(row.r2_key, PNG_BYTES), recentRequests: 3000 })
    const res = await call(onRequestGet, env, TRIP_ID, PHOTO_ID)
    expect(res.status).toBe(429)
    expect(calls.find((c) => c.sql.includes('FROM request_log'))?.args).toContain('photos-read')
  })

  it('answers 500 when R2 is unreachable', async () => {
    const { env } = photoEnv({ photos: [photoRow()], r2: fakeR2(true) })
    const res = await call(onRequestGet, env, TRIP_ID, PHOTO_ID)
    expect(res.status).toBe(500)
  })
})

describe('DELETE /api/trips/:id/photos/:photoId', () => {
  it('removes both the R2 object and the row', async () => {
    const row = photoRow()
    const r2 = bucketWith(row.r2_key, PNG_BYTES)
    const { env, calls } = photoEnv({ photos: [row], r2 })
    const res = await call(onRequestDelete, env, TRIP_ID, PHOTO_ID)
    expect(res.status).toBe(200)
    expect(r2.objects.has(row.r2_key)).toBe(false)
    const del = calls.find((c) => c.sql.startsWith('DELETE FROM trip_photos'))
    expect(del?.sql).toContain('trip_id = ?')
    expect(del?.args).toEqual([PHOTO_ID, TRIP_ID])
  })

  it('answers 404 for a photo on a different trip and deletes nothing', async () => {
    const foreign = photoRow({ trip_id: OTHER_TRIP_ID })
    const r2 = bucketWith(foreign.r2_key, PNG_BYTES)
    const { env, calls } = photoEnv({ photos: [foreign], r2 })
    const res = await call(onRequestDelete, env, TRIP_ID, PHOTO_ID)
    expect(res.status).toBe(404)
    expect(r2.objects.has(foreign.r2_key)).toBe(true)
    expect(calls.some((c) => c.sql.startsWith('DELETE'))).toBe(false)
  })

  it('rate-limits deletes with 429 under the photos-delete key and deletes nothing', async () => {
    const row = photoRow()
    const r2 = bucketWith(row.r2_key, PNG_BYTES)
    const { env, calls } = photoEnv({ photos: [row], r2, recentRequests: 120 })
    const res = await call(onRequestDelete, env, TRIP_ID, PHOTO_ID)
    expect(res.status).toBe(429)
    expect(r2.objects.has(row.r2_key)).toBe(true)
    expect(calls.find((c) => c.sql.includes('FROM request_log'))?.args).toContain('photos-delete')
  })

  it('keeps the row when the R2 delete fails, so the photo can be retried rather than orphaned', async () => {
    const { env, calls } = photoEnv({ photos: [photoRow()], r2: fakeR2(true) })
    const res = await call(onRequestDelete, env, TRIP_ID, PHOTO_ID)
    expect(res.status).toBe(500)
    expect(calls.some((c) => c.sql.startsWith('DELETE FROM trip_photos'))).toBe(false)
  })
})
