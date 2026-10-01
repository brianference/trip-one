// @vitest-environment node
//
// Node's environment gives the real undici Request/FormData/File, which is
// what multipart parsing in a Worker behaves like; jsdom's File does not
// round-trip through Request.formData().
import { describe, it, expect } from 'vitest'
import { onRequestGet, onRequestPost, MAX_PHOTO_BYTES, MAX_PHOTOS_PER_STOP, MAX_PHOTOS_PER_TRIP } from './index'
import { fakeR2 } from '../../../../lib/testD1'
import {
  photoEnv,
  photoRow,
  TRIP_ID,
  OTHER_TRIP_ID,
  STOP_ID,
  SECOND_STOP_ID,
  REMOVED_STOP_ID,
  JPEG_BYTES,
  PNG_BYTES,
  HTML_BYTES,
} from '../../../../lib/testPhotos'
import { DEMO_TRIP_IDS } from '../../../../../src/lib/api/demoIds'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

interface UploadFields {
  file?: Blob | null
  fileName?: string
  stop_id?: string | null
  width?: string | null
  height?: string | null
}

/**
 * Builds a multipart upload request the way a browser sends a FormData body:
 * serialized up front, with its multipart Content-Type and a Content-Length.
 * (undici's `new Request(url, { body: form })` leaves Content-Length off the
 * request's headers, which the handler now refuses with 411.) Every field
 * defaults to a valid value; pass null to omit one.
 */
async function uploadRequest(tripId: string, fields: UploadFields = {}): Promise<Request> {
  const form = new FormData()
  const file = fields.file === undefined ? new Blob([JPEG_BYTES], { type: 'image/jpeg' }) : fields.file
  if (file) form.append('file', file, fields.fileName ?? 'photo.jpg')
  const stopId = fields.stop_id === undefined ? STOP_ID : fields.stop_id
  if (stopId !== null) form.append('stop_id', stopId)
  const width = fields.width === undefined ? '800' : fields.width
  if (width !== null) form.append('width', width)
  const height = fields.height === undefined ? '600' : fields.height
  if (height !== null) form.append('height', height)
  const encoded = new Response(form)
  const body = new Uint8Array(await encoded.arrayBuffer())
  return new Request(`https://x/api/trips/${tripId}/photos`, {
    method: 'POST',
    headers: {
      'Content-Type': encoded.headers.get('Content-Type') ?? '',
      'Content-Length': String(body.byteLength),
    },
    body,
  })
}

/** Calls the upload handler. */
async function upload(env: ReturnType<typeof photoEnv>['env'], request: Request | Promise<Request>, tripId = TRIP_ID) {
  return onRequestPost({ env, request: await request, params: { id: tripId } })
}

/** True when any recorded D1 statement inserted a photo row. */
function inserted(calls: { sql: string }[]): boolean {
  return calls.some((c) => c.sql.includes('INSERT INTO trip_photos'))
}

/**
 * `count` photo rows on `stopId`, with distinct uuids starting at `offset`.
 * @param stopId - The stop every row is on
 * @param count - How many rows
 * @param offset - First index used in the ids, so two batches never collide
 */
function photoRowsOn(stopId: string, count: number, offset = 0) {
  return Array.from({ length: count }, (_, index) =>
    photoRow({ id: `9f000000-0000-4000-8000-${String(offset + index).padStart(12, '0')}`, stop_id: stopId }),
  )
}

describe('POST /api/trips/:id/photos', () => {
  it('stores a valid JPEG under trips/<tripId>/<photoId> and records the row', async () => {
    const { env, calls, r2 } = photoEnv()
    const res = await upload(env, uploadRequest(TRIP_ID))
    expect(res.status).toBe(201)
    const body = (await res.json()) as { id: string; stopId: string; width: number; height: number; createdAt: string }
    expect(Object.keys(body).sort()).toEqual(['createdAt', 'height', 'id', 'stopId', 'width'])
    expect(body.id).toMatch(UUID_RE)
    expect(body).toMatchObject({ stopId: STOP_ID, width: 800, height: 600 })
    expect(Number.isNaN(Date.parse(body.createdAt))).toBe(false)

    const key = `trips/${TRIP_ID}/${body.id}`
    expect([...r2.objects.keys()]).toEqual([key])
    expect(r2.objects.get(key)?.contentType).toBe('image/jpeg')
    expect(Array.from(r2.objects.get(key)?.bytes ?? [])).toEqual(Array.from(JPEG_BYTES))

    const insert = calls.find((c) => c.sql.includes('INSERT INTO trip_photos'))
    expect(insert?.args).toEqual([
      body.id,
      TRIP_ID,
      STOP_ID,
      key,
      'image/jpeg',
      800,
      600,
      JPEG_BYTES.byteLength,
      body.createdAt,
      // Uploaded through the trip link, not by a signed-in contributor.
      null,
    ])
  })

  it('stores the SNIFFED type, not the declared one (a PNG declared image/jpeg is kept as image/png)', async () => {
    const { env, r2 } = photoEnv()
    const res = await upload(env, uploadRequest(TRIP_ID, { file: new Blob([PNG_BYTES], { type: 'image/jpeg' }) }))
    expect(res.status).toBe(201)
    const [stored] = [...r2.objects.values()]
    expect(stored.contentType).toBe('image/png')
  })

  it('rejects HTML bytes declared as image/jpeg with 415 and stores nothing', async () => {
    const { env, calls, r2 } = photoEnv()
    const res = await upload(
      env,
      uploadRequest(TRIP_ID, { file: new Blob([HTML_BYTES], { type: 'image/jpeg' }), fileName: 'cat.jpg' }),
    )
    expect(res.status).toBe(415)
    expect((await res.json()).error).toBe('That file isn’t a photo we can use. Please choose a JPEG, PNG or WebP image.')
    expect(r2.objects.size).toBe(0)
    expect(inserted(calls)).toBe(false)
  })

  it('rejects an upload without a stop_id with 400', async () => {
    const { env, r2 } = photoEnv()
    const res = await upload(env, uploadRequest(TRIP_ID, { stop_id: null }))
    expect(res.status).toBe(400)
    expect(r2.objects.size).toBe(0)
  })

  it('rejects an upload without a file with 400', async () => {
    const { env, r2 } = photoEnv()
    const res = await upload(env, uploadRequest(TRIP_ID, { file: null }))
    expect(res.status).toBe(400)
    expect(r2.objects.size).toBe(0)
  })

  it('rejects a stop_id that is not in the trip itinerary with 400', async () => {
    const { env, r2, calls } = photoEnv()
    const res = await upload(env, uploadRequest(TRIP_ID, { stop_id: '5a0b1c2d-0000-4000-8000-0000000000ff' }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('That stop isn’t on this trip any more. Refresh the page and try again.')
    expect(r2.objects.size).toBe(0)
    expect(inserted(calls)).toBe(false)
  })

  it.each([
    ['zero', '0'],
    ['above 10000', '10001'],
    ['a fraction', '1.5'],
    ['not a number', 'wide'],
    ['missing', null],
  ])('rejects a width that is %s with 400', async (_label, width) => {
    const { env, r2 } = photoEnv()
    const res = await upload(env, uploadRequest(TRIP_ID, { width }))
    expect(res.status).toBe(400)
    expect(r2.objects.size).toBe(0)
  })

  it('accepts the 1 and 10000 bounds for width and height', async () => {
    const { env } = photoEnv()
    const res = await upload(env, uploadRequest(TRIP_ID, { width: '1', height: '10000' }))
    expect(res.status).toBe(201)
  })

  it('refuses photos on a demo trip with 403', async () => {
    const { env, r2 } = photoEnv()
    const res = await upload(env, uploadRequest(DEMO_TRIP_IDS.dublin), DEMO_TRIP_IDS.dublin)
    expect(res.status).toBe(403)
    expect((await res.json()).error).toBe("Demo trips can't hold photos. Start your own trip to add some.")
    expect(r2.objects.size).toBe(0)
  })

  it('rejects a file over MAX_PHOTO_BYTES with 413 and stores nothing', async () => {
    const { env, calls, r2 } = photoEnv()
    const big = new Uint8Array(MAX_PHOTO_BYTES + 1)
    big.set(JPEG_BYTES)
    const res = await upload(env, uploadRequest(TRIP_ID, { file: new Blob([big], { type: 'image/jpeg' }) }))
    expect(res.status).toBe(413)
    expect(r2.objects.size).toBe(0)
    expect(inserted(calls)).toBe(false)
  })

  it('accepts a file of exactly MAX_PHOTO_BYTES', async () => {
    const { env, r2 } = photoEnv()
    const exact = new Uint8Array(MAX_PHOTO_BYTES)
    exact.set(JPEG_BYTES)
    const res = await upload(env, uploadRequest(TRIP_ID, { file: new Blob([exact], { type: 'image/jpeg' }) }))
    expect(res.status).toBe(201)
    expect([...r2.objects.values()][0].bytes.byteLength).toBe(MAX_PHOTO_BYTES)
  })

  it('rejects a declared Content-Length far beyond the limit with 413 before parsing the body', async () => {
    const { env, r2 } = photoEnv()
    const request = new Request(`https://x/api/trips/${TRIP_ID}/photos`, {
      method: 'POST',
      headers: { 'Content-Length': String(MAX_PHOTO_BYTES * 10), 'Content-Type': 'multipart/form-data; boundary=x' },
      body: 'not really multipart',
    })
    const res = await upload(env, request)
    expect(res.status).toBe(413)
    expect(r2.objects.size).toBe(0)
  })

  it('refuses a streamed body with no Content-Length with 411, before parsing it', async () => {
    const { env, r2, calls } = photoEnv()
    const multipart = await uploadRequest(TRIP_ID)
    const stream = new Blob([await multipart.arrayBuffer()]).stream()
    const request = new Request(`https://x/api/trips/${TRIP_ID}/photos`, {
      method: 'POST',
      headers: { 'Content-Type': multipart.headers.get('Content-Type') ?? '' },
      body: stream,
      duplex: 'half',
    } as RequestInit)
    expect(request.headers.get('Content-Length')).toBeNull()
    const res = await upload(env, request)
    expect(res.status).toBe(411)
    expect((await res.json()).error).toBe('We couldn’t tell how large that upload is. Please choose the photo again and retry.')
    expect(request.bodyUsed).toBe(false)
    expect(r2.objects.size).toBe(0)
    expect(inserted(calls)).toBe(false)
  })

  it.each([['not a number', 'lots'], ['negative', '-5'], ['a fraction', '10.5'], ['empty', '']])(
    'refuses a Content-Length that is %s with 411',
    async (_label, contentLength) => {
      const { env, r2 } = photoEnv()
      const multipart = await uploadRequest(TRIP_ID)
      const request = new Request(`https://x/api/trips/${TRIP_ID}/photos`, {
        method: 'POST',
        headers: { 'Content-Type': multipart.headers.get('Content-Type') ?? '', 'Content-Length': contentLength },
        body: await multipart.arrayBuffer(),
      })
      const res = await upload(env, request)
      expect(res.status).toBe(411)
      expect(r2.objects.size).toBe(0)
    },
  )

  it('rejects the upload with 409 when the stop already has MAX_PHOTOS_PER_STOP photos', async () => {
    const { env, r2 } = photoEnv({ stopPhotoCount: MAX_PHOTOS_PER_STOP })
    const res = await upload(env, uploadRequest(TRIP_ID))
    expect(res.status).toBe(409)
    expect(r2.objects.size).toBe(0)
  })

  it('allows the upload when the stop is one short of MAX_PHOTOS_PER_STOP', async () => {
    const { env } = photoEnv({ stopPhotoCount: MAX_PHOTOS_PER_STOP - 1 })
    const res = await upload(env, uploadRequest(TRIP_ID))
    expect(res.status).toBe(201)
  })

  it('rejects the upload with 409 when the trip already has MAX_PHOTOS_PER_TRIP photos on current stops', async () => {
    const { env, r2 } = photoEnv({ photos: photoRowsOn(SECOND_STOP_ID, MAX_PHOTOS_PER_TRIP) })
    const res = await upload(env, uploadRequest(TRIP_ID))
    expect(res.status).toBe(409)
    expect(r2.objects.size).toBe(0)
  })

  it('does not count photos on a stop removed from the itinerary toward MAX_PHOTOS_PER_TRIP', async () => {
    const photos = [...photoRowsOn(SECOND_STOP_ID, MAX_PHOTOS_PER_TRIP - 1), ...photoRowsOn(REMOVED_STOP_ID, 10, 1000)]
    const { env } = photoEnv({ photos })
    const res = await upload(env, uploadRequest(TRIP_ID))
    expect(res.status).toBe(201)
  })

  it('rate-limits uploads with 429 and stores nothing', async () => {
    const { env, calls, r2 } = photoEnv({ recentRequests: 120 })
    const res = await upload(env, uploadRequest(TRIP_ID))
    expect(res.status).toBe(429)
    expect(r2.objects.size).toBe(0)
    expect(inserted(calls)).toBe(false)
    const countCall = calls.find((c) => c.sql.includes('FROM request_log'))
    expect(countCall?.args).toContain('photos-upload')
  })

  it('answers 404 for an unknown trip', async () => {
    const { env, r2 } = photoEnv({ tripExists: false })
    const res = await upload(env, uploadRequest(TRIP_ID))
    expect(res.status).toBe(404)
    expect(r2.objects.size).toBe(0)
  })

  it('answers 404 for a trip id that is not a uuid', async () => {
    const { env } = photoEnv()
    const res = await upload(env, uploadRequest('../../etc'), '../../etc')
    expect(res.status).toBe(404)
  })

  it('removes the R2 object again when the D1 insert fails, and answers 500', async () => {
    const { env, r2 } = photoEnv({ runFailsOn: 'INSERT INTO trip_photos' })
    const res = await upload(env, uploadRequest(TRIP_ID))
    expect(res.status).toBe(500)
    expect(r2.objects.size).toBe(0)
  })

  it('answers 500 when R2 is unreachable and records no row', async () => {
    const { env, calls } = photoEnv({ r2: fakeR2(true) })
    const res = await upload(env, uploadRequest(TRIP_ID))
    expect(res.status).toBe(500)
    expect(inserted(calls)).toBe(false)
  })
})

describe('GET /api/trips/:id/photos', () => {
  it('lists the trip’s photos in the public shape, without storage internals', async () => {
    const { env } = photoEnv({
      photos: [photoRow(), photoRow({ id: '9f000000-0000-4000-8000-000000000009', trip_id: OTHER_TRIP_ID })],
    })
    const res = await onRequestGet({ env, request: new Request('https://x'), params: { id: TRIP_ID } })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({
      photos: [
        { id: photoRow().id, stopId: STOP_ID, width: 800, height: 600, createdAt: photoRow().created_at },
      ],
    })
  })

  it('leaves out a photo whose stop was removed from the itinerary', async () => {
    const orphan = photoRow({ id: '9f000000-0000-4000-8000-0000000000aa', stop_id: REMOVED_STOP_ID })
    const kept = photoRow({ id: '9f000000-0000-4000-8000-0000000000bb', stop_id: SECOND_STOP_ID })
    const { env } = photoEnv({ photos: [photoRow(), orphan, kept] })
    const res = await onRequestGet({ env, request: new Request('https://x'), params: { id: TRIP_ID } })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { photos: { id: string }[] }
    expect(body.photos.map((p) => p.id)).toEqual([photoRow().id, kept.id])
  })

  it('answers 404 for an unknown trip', async () => {
    const { env } = photoEnv({ tripExists: false })
    const res = await onRequestGet({ env, request: new Request('https://x'), params: { id: TRIP_ID } })
    expect(res.status).toBe(404)
  })

  it('rate-limits reads with 429 under the photos-read key', async () => {
    const { env, calls } = photoEnv({ recentRequests: 3000 })
    const res = await onRequestGet({ env, request: new Request('https://x'), params: { id: TRIP_ID } })
    expect(res.status).toBe(429)
    expect(calls.find((c) => c.sql.includes('FROM request_log'))?.args).toContain('photos-read')
  })
})
