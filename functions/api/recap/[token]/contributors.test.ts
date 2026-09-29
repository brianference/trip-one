// @vitest-environment node
//
// Node's environment gives the real undici Request/FormData/File (multipart
// parsing as in a Worker) and Web Crypto's `subtle` for signing sessions.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { onRequestGet as getMe } from './me'
import { onRequestPost as uploadPhoto, RECAP_PHOTO_UPLOADS_PER_HOUR } from './photos/index'
import { onRequestDelete as deletePhoto, RECAP_PHOTO_DELETES_PER_HOUR } from './photos/[photoId]'
import { onRequestGet as getRecap } from '../[token]'
import { onRequestGet as getMyTrips } from '../../my-trips'
import { recapTokenSchema } from '../../../lib/recapAccess'
import { CONTRIBUTOR_FORBIDDEN_MESSAGE } from '../../../lib/recapMember'
import { MAX_PHOTOS_PER_STOP } from '../../../lib/photoUpload'
import type { RecapPayload } from '../../../../src/features/recap/types'
import { logger } from '../../../../src/lib/logger'
import {
  contributorWorld,
  cookieFor,
  containsTripId,
  ACTIVE_TOKEN,
  REVOKED_TOKEN,
  OTHER_TOKEN,
  UNKNOWN_TOKEN,
  TRIP_ID,
  STOP_A,
  STOP_B,
  OWNER,
  SAM,
  JO,
  OUTSIDER,
  OWNER_PHOTO,
  SAM_PHOTO,
  JO_PHOTO,
  OTHER_TRIP_PHOTO,
  JPEG_BYTES,
  type ContributorWorld,
} from '../../../lib/testContributors'

afterEach(() => {
  vi.restoreAllMocks()
})

const FORBIDDEN = { error: CONTRIBUTOR_FORBIDDEN_MESSAGE }
const SIGN_IN = { error: 'Sign in first' }
const HTML_BYTES = new TextEncoder().encode('<!doctype html><script>alert(1)</script>')

/** Headers for a request, with an optional session cookie and a per-test IP. */
function headers(cookie?: string, ip = '203.0.113.40'): Record<string, string> {
  const h: Record<string, string> = { 'CF-Connecting-IP': ip }
  if (cookie) h.Cookie = cookie
  return h
}

/** Status, no-store header, and the body text with the no-trip-id check applied. */
async function read(res: Response): Promise<{ status: number; cache: string | null; text: string; body: unknown }> {
  const text = await res.text()
  expect(containsTripId(text), `response body leaked a trip id: ${text}`).toBe(false)
  return { status: res.status, cache: res.headers.get('Cache-Control'), text, body: JSON.parse(text) }
}

/**
 * A multipart upload as a browser sends it (serialized up front with a
 * Content-Length, which the upload pipeline requires).
 */
async function uploadRequest(
  token: string,
  opts: { cookie?: string; stopId?: string; bytes?: Uint8Array<ArrayBuffer>; ip?: string } = {},
): Promise<Request> {
  const form = new FormData()
  form.append('file', new Blob([opts.bytes ?? JPEG_BYTES], { type: 'image/jpeg' }), 'photo.jpg')
  form.append('stop_id', opts.stopId ?? STOP_A)
  form.append('width', '800')
  form.append('height', '600')
  const encoded = new Response(form)
  const body = new Uint8Array(await encoded.arrayBuffer())
  return new Request(`https://trip-one.pages.dev/api/recap/${token}/photos`, {
    method: 'POST',
    headers: {
      ...headers(opts.cookie, opts.ip),
      'Content-Type': encoded.headers.get('Content-Type') ?? '',
      'Content-Length': String(body.byteLength),
    },
    body,
  })
}

/** POSTs an upload through the contributor route. */
async function upload(w: ContributorWorld, token: string, opts: Parameters<typeof uploadRequest>[1] = {}) {
  return uploadPhoto({ env: w.env, request: await uploadRequest(token, opts), params: { token } })
}

/** DELETEs a photo through the contributor route. */
function remove(w: ContributorWorld, token: string, photoId: string, cookie?: string, ip?: string) {
  return deletePhoto({
    env: w.env,
    request: new Request(`https://trip-one.pages.dev/api/recap/${token}/photos/${photoId}`, {
      method: 'DELETE',
      headers: headers(cookie, ip),
    }),
    params: { token, photoId },
  })
}

/** GETs /me for a token. */
function me(w: ContributorWorld, token: string, cookie?: string) {
  return getMe({ env: w.env, request: new Request(`https://x/api/recap/${token}/me`, { headers: headers(cookie) }), params: { token } })
}

/** GETs the recap payload for a token. */
async function recap(w: ContributorWorld, token: string, cookie?: string): Promise<RecapPayload> {
  const res = await getRecap({ env: w.env, request: new Request(`https://x/api/recap/${token}`, { headers: headers(cookie) }), params: { token } })
  expect(res.status).toBe(200)
  return (await read(res)).body as RecapPayload
}

/** The recap GET's 404, for comparing bodies byte for byte. */
async function recap404(w: ContributorWorld, token: string): Promise<string> {
  const res = await getRecap({ env: w.env, request: new Request(`https://x/api/recap/${token}`), params: { token } })
  expect(res.status).toBe(404)
  return res.text()
}

/** Photo ids currently in the database. */
function photoIds(w: ContributorWorld): string[] {
  return w.rows<{ id: string }>('SELECT id FROM trip_photos ORDER BY id').map((r) => r.id)
}

describe('fixtures', () => {
  it('uses well-formed recap tokens', () => {
    for (const token of [ACTIVE_TOKEN, REVOKED_TOKEN, OTHER_TOKEN, UNKNOWN_TOKEN]) {
      expect(recapTokenSchema.safeParse(token).success, token).toBe(true)
    }
  })
})

describe('GET /api/recap/:token/me', () => {
  it('says member with the viewer’s own id for a member, uncached, with no trip id', async () => {
    const w = contributorWorld()
    const res = await read(await me(w, ACTIVE_TOKEN, await cookieFor(SAM.id)))
    expect(res.status).toBe(200)
    expect(res.cache).toBe('private, no-store')
    expect(res.body).toEqual({ member: true, userId: SAM.id })
  })

  it('says not a member for a signed-in stranger, and for the owner (who is not a member)', async () => {
    const w = contributorWorld()
    expect((await read(await me(w, ACTIVE_TOKEN, await cookieFor(OUTSIDER.id)))).body).toEqual({ member: false, userId: OUTSIDER.id })
    expect((await read(await me(w, ACTIVE_TOKEN, await cookieFor(OWNER.id)))).body).toEqual({ member: false, userId: OWNER.id })
  })

  it('says {member:false} signed out', async () => {
    const w = contributorWorld()
    const res = await read(await me(w, ACTIVE_TOKEN))
    expect(res).toMatchObject({ status: 200, cache: 'private, no-store', body: { member: false } })
  })

  it.each([
    ['unknown', UNKNOWN_TOKEN],
    ['revoked', REVOKED_TOKEN],
    ['malformed', 'not-a-token'],
  ])('answers an %s token with exactly the recap GET 404, even for a member', async (_label, token) => {
    const w = contributorWorld()
    const res = await me(w, token, await cookieFor(SAM.id))
    expect(res.status).toBe(404)
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
    expect(await res.text()).toBe(await recap404(w, token))
  })

  it('membership is per trip: a member of another trip is not a member here', async () => {
    const w = contributorWorld()
    expect((await read(await me(w, OTHER_TOKEN, await cookieFor(SAM.id)))).body).toEqual({ member: false, userId: SAM.id })
    expect((await read(await me(w, OTHER_TOKEN, await cookieFor(OUTSIDER.id)))).body).toEqual({ member: true, userId: OUTSIDER.id })
  })
})

describe('POST /api/recap/:token/photos', () => {
  it('stores a member’s photo on the stop through the shared pipeline, recording them as uploader', async () => {
    const w = contributorWorld()
    const res = await read(await upload(w, ACTIVE_TOKEN, { cookie: await cookieFor(SAM.id), stopId: STOP_B }))
    expect(res.status).toBe(201)
    expect(res.cache).toBe('private, no-store')
    const body = res.body as RecapPayload['photos'][number]
    expect(Object.keys(body).sort()).toEqual(['createdAt', 'height', 'id', 'mine', 'stopId', 'width'])
    expect(body).toMatchObject({ stopId: STOP_B, width: 800, height: 600, mine: true })

    const [row] = w.rows<{ trip_id: string; stop_id: string; uploader_user_id: string; r2_key: string; content_type: string }>(
      'SELECT trip_id, stop_id, uploader_user_id, r2_key, content_type FROM trip_photos WHERE id = ?',
      body.id,
    )
    expect(row).toEqual({
      trip_id: TRIP_ID,
      stop_id: STOP_B,
      uploader_user_id: SAM.id,
      r2_key: `trips/${TRIP_ID}/${body.id}`,
      content_type: 'image/jpeg',
    })
    expect(w.r2.objects.get(`trips/${TRIP_ID}/${body.id}`)?.contentType).toBe('image/jpeg')
  })

  it('answers 401 signed out, and stores nothing', async () => {
    const w = contributorWorld()
    const before = photoIds(w)
    const res = await read(await upload(w, ACTIVE_TOKEN))
    expect(res).toMatchObject({ status: 401, cache: 'private, no-store', body: SIGN_IN })
    expect(photoIds(w)).toEqual(before)
  })

  it('answers 403 for a signed-in non-member (and for the owner’s own account), and stores nothing', async () => {
    const w = contributorWorld()
    const before = photoIds(w)
    const objectsBefore = w.r2.objects.size
    for (const userId of [OUTSIDER.id, OWNER.id]) {
      const res = await read(await upload(w, ACTIVE_TOKEN, { cookie: await cookieFor(userId) }))
      expect(res).toMatchObject({ status: 403, cache: 'private, no-store', body: FORBIDDEN })
    }
    expect(photoIds(w)).toEqual(before)
    expect(w.r2.objects.size).toBe(objectsBefore)
  })

  it.each([
    ['unknown', UNKNOWN_TOKEN],
    ['revoked', REVOKED_TOKEN],
    ['malformed', 'not-a-token'],
  ])('answers an %s token with the recap 404, even for a member', async (_label, token) => {
    const w = contributorWorld()
    const before = photoIds(w)
    const res = await upload(w, token, { cookie: await cookieFor(SAM.id) })
    expect(res.status).toBe(404)
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
    expect(await res.text()).toBe(await recap404(w, token))
    expect(photoIds(w)).toEqual(before)
  })

  it('reuses the pipeline’s refusals: non-image bytes 415, full stop 409, missing Content-Length 411', async () => {
    const w = contributorWorld()
    const cookie = await cookieFor(SAM.id)
    expect((await read(await upload(w, ACTIVE_TOKEN, { cookie, bytes: HTML_BYTES }))).status).toBe(415)

    for (let i = 0; i < MAX_PHOTOS_PER_STOP - 2; i += 1) {
      expect((await read(await upload(w, ACTIVE_TOKEN, { cookie }))).status).toBe(201)
    }
    expect((await read(await upload(w, ACTIVE_TOKEN, { cookie }))).status).toBe(409)

    const request = await uploadRequest(ACTIVE_TOKEN, { cookie, stopId: STOP_B })
    const chunked = new Request(request.url, { method: 'POST', headers: { Cookie: cookie, 'Content-Type': request.headers.get('Content-Type') ?? '' }, body: await request.arrayBuffer() })
    chunked.headers.delete('Content-Length')
    expect((await read(await uploadPhoto({ env: w.env, request: chunked, params: { token: ACTIVE_TOKEN } }))).status).toBe(411)
  })

  it('refuses a stop the recap does not have, a legacy stop without an id, and another trip’s stop (400)', async () => {
    const w = contributorWorld()
    const cookie = await cookieFor(SAM.id)
    for (const stopId of ['stop-1', 'stop-99', '5a0b1c2d-0000-4000-8000-0000000000b1']) {
      const res = await read(await upload(w, ACTIVE_TOKEN, { cookie, stopId }))
      expect(res.status, stopId).toBe(400)
    }
  })

  it('never writes a photo onto another trip, even when the member names that trip’s stop', async () => {
    const w = contributorWorld()
    await upload(w, ACTIVE_TOKEN, { cookie: await cookieFor(SAM.id), stopId: '5a0b1c2d-0000-4000-8000-0000000000b1' })
    expect(w.rows('SELECT id FROM trip_photos WHERE trip_id != ?', TRIP_ID)).toHaveLength(1)
  })

  it(`rate-limits past ${RECAP_PHOTO_UPLOADS_PER_HOUR} uploads per hour per IP under "recap-photo-upload"`, async () => {
    const w = contributorWorld()
    const ip = '203.0.113.77'
    const ipHashRows = () => w.rows<{ n: number }>("SELECT COUNT(*) AS n FROM request_log WHERE endpoint = 'recap-photo-upload'")[0].n
    // Pre-fill the log rather than performing 120 uploads.
    const first = await upload(w, ACTIVE_TOKEN, { ip })
    expect(first.status).toBe(401)
    const [{ ip_hash: ipHash }] = w.rows<{ ip_hash: string }>("SELECT ip_hash FROM request_log WHERE endpoint = 'recap-photo-upload'")
    for (let i = 1; i < RECAP_PHOTO_UPLOADS_PER_HOUR; i += 1) {
      w.exec("INSERT INTO request_log (ip_hash, endpoint, created_at) VALUES (?, 'recap-photo-upload', ?)", ipHash, new Date().toISOString())
    }
    expect(ipHashRows()).toBe(RECAP_PHOTO_UPLOADS_PER_HOUR)
    const limited = await read(await upload(w, ACTIVE_TOKEN, { cookie: await cookieFor(SAM.id), ip }))
    expect(limited).toMatchObject({ status: 429, cache: 'private, no-store' })
    expect(RECAP_PHOTO_UPLOADS_PER_HOUR).toBe(120)
  })

  it('answers 500 without a trip id when the database fails mid-request', async () => {
    const w = contributorWorld()
    vi.spyOn(logger, 'error').mockImplementation(() => {})
    const broken = { ...w.env, PHOTOS: { put: async () => { throw new Error('R2 down') }, delete: async () => {}, get: async () => null } as unknown as typeof w.env.PHOTOS }
    const res = await uploadPhoto({ env: broken, request: await uploadRequest(ACTIVE_TOKEN, { cookie: await cookieFor(SAM.id) }), params: { token: ACTIVE_TOKEN } })
    expect((await read(res)).status).toBe(500)
  })
})

describe('DELETE /api/recap/:token/photos/:photoId', () => {
  it('removes the member’s own photo: R2 object and row', async () => {
    const w = contributorWorld()
    const res = await read(await remove(w, ACTIVE_TOKEN, SAM_PHOTO, await cookieFor(SAM.id)))
    expect(res).toMatchObject({ status: 200, cache: 'private, no-store', body: { ok: true } })
    expect(photoIds(w)).not.toContain(SAM_PHOTO)
    expect(w.r2.objects.has(`trips/${TRIP_ID}/${SAM_PHOTO}`)).toBe(false)
  })

  it('refuses another member’s photo and the owner’s photo with 403, the SAME body as not-a-member, and deletes nothing', async () => {
    const w = contributorWorld()
    const cookie = await cookieFor(SAM.id)
    const bodies: string[] = []
    for (const photoId of [JO_PHOTO, OWNER_PHOTO]) {
      const res = await read(await remove(w, ACTIVE_TOKEN, photoId, cookie))
      expect(res.status).toBe(403)
      expect(res.cache).toBe('private, no-store')
      bodies.push(res.text)
    }
    const stranger = await read(await remove(w, ACTIVE_TOKEN, SAM_PHOTO, await cookieFor(OUTSIDER.id)))
    expect(stranger.status).toBe(403)
    bodies.push(stranger.text)
    expect(new Set(bodies)).toEqual(new Set([JSON.stringify(FORBIDDEN)]))
    expect(photoIds(w)).toEqual(expect.arrayContaining([JO_PHOTO, OWNER_PHOTO, SAM_PHOTO]))
    expect(w.r2.objects.has(`trips/${TRIP_ID}/${JO_PHOTO}`)).toBe(true)
    expect(w.r2.objects.has(`trips/${TRIP_ID}/${OWNER_PHOTO}`)).toBe(true)
  })

  it('answers 401 signed out and deletes nothing', async () => {
    const w = contributorWorld()
    const res = await read(await remove(w, ACTIVE_TOKEN, SAM_PHOTO))
    expect(res).toMatchObject({ status: 401, cache: 'private, no-store', body: SIGN_IN })
    expect(photoIds(w)).toContain(SAM_PHOTO)
  })

  it.each([
    ['unknown', UNKNOWN_TOKEN],
    ['revoked', REVOKED_TOKEN],
    ['malformed', 'not-a-token'],
  ])('answers an %s token with the recap 404, even for the uploader', async (_label, token) => {
    const w = contributorWorld()
    const res = await remove(w, token, SAM_PHOTO, await cookieFor(SAM.id))
    expect(res.status).toBe(404)
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
    expect(await res.text()).toBe(await recap404(w, token))
    expect(photoIds(w)).toContain(SAM_PHOTO)
  })

  it('answers 404 for a photo on another trip, even one the caller uploaded there', async () => {
    const w = contributorWorld()
    const res = await read(await remove(w, ACTIVE_TOKEN, OTHER_TRIP_PHOTO, await cookieFor(OUTSIDER.id)))
    // OUTSIDER is not a member of TRIP_ID, so membership refuses first.
    expect(res.status).toBe(403)
    const member = await read(await remove(w, ACTIVE_TOKEN, OTHER_TRIP_PHOTO, await cookieFor(SAM.id)))
    expect(member.status).toBe(404)
    expect(photoIds(w)).toContain(OTHER_TRIP_PHOTO)
  })

  it(`rate-limits under "recap-photo-delete" at ${RECAP_PHOTO_DELETES_PER_HOUR} per hour`, async () => {
    const w = contributorWorld()
    const ip = '203.0.113.78'
    expect((await remove(w, ACTIVE_TOKEN, SAM_PHOTO, undefined, ip)).status).toBe(401)
    const [{ ip_hash: ipHash }] = w.rows<{ ip_hash: string }>("SELECT ip_hash FROM request_log WHERE endpoint = 'recap-photo-delete'")
    for (let i = 1; i < RECAP_PHOTO_DELETES_PER_HOUR; i += 1) {
      w.exec("INSERT INTO request_log (ip_hash, endpoint, created_at) VALUES (?, 'recap-photo-delete', ?)", ipHash, new Date().toISOString())
    }
    const limited = await read(await remove(w, ACTIVE_TOKEN, SAM_PHOTO, await cookieFor(SAM.id), ip))
    expect(limited).toMatchObject({ status: 429, cache: 'private, no-store' })
    expect(photoIds(w)).toContain(SAM_PHOTO)
    expect(RECAP_PHOTO_DELETES_PER_HOUR).toBe(120)
  })
})

describe('GET /api/recap/:token marks a member’s own photos', () => {
  it('sets mine: true only on the photos the signed-in member uploaded', async () => {
    const w = contributorWorld()
    const payload = await recap(w, ACTIVE_TOKEN, await cookieFor(SAM.id))
    const mine = payload.photos.filter((p) => p.mine === true).map((p) => p.id)
    expect(mine).toEqual([SAM_PHOTO])
    // Other photos carry no `mine` key at all, not even false.
    for (const photo of payload.photos.filter((p) => p.id !== SAM_PHOTO)) expect('mine' in photo).toBe(false)
  })

  it('marks nothing for a signed-out viewer, a non-member, or a non-member whose id matches no uploader', async () => {
    const w = contributorWorld()
    for (const cookie of [undefined, await cookieFor(OUTSIDER.id), await cookieFor(OWNER.id)]) {
      const payload = await recap(w, ACTIVE_TOKEN, cookie)
      expect(payload.photos.some((p) => 'mine' in p)).toBe(false)
    }
  })

  it('does not mark a photo for its uploader once they are no longer a member', async () => {
    const w = contributorWorld()
    w.exec('DELETE FROM trip_members WHERE trip_id = ? AND user_id = ?', TRIP_ID, SAM.id)
    const payload = await recap(w, ACTIVE_TOKEN, await cookieFor(SAM.id))
    expect(payload.photos.some((p) => 'mine' in p)).toBe(false)
  })

  it('shows a contributor’s upload to everyone, and it is uncached', async () => {
    const w = contributorWorld()
    const res = await read(await upload(w, ACTIVE_TOKEN, { cookie: await cookieFor(JO.id), stopId: STOP_B }))
    const id = (res.body as { id: string }).id
    const anonymous = await recap(w, ACTIVE_TOKEN)
    expect(anonymous.photos.map((p) => p.id)).toContain(id)
    const raw = await getRecap({ env: w.env, request: new Request(`https://x/api/recap/${ACTIVE_TOKEN}`), params: { token: ACTIVE_TOKEN } })
    expect(raw.headers.get('Cache-Control')).toBe('private, no-store')
  })
})

describe('GET /api/my-trips joined', () => {
  /** GETs my-trips signed in as a user. */
  async function myTrips(w: ContributorWorld, userId: string) {
    return getMyTrips({ env: w.env, request: new Request('https://x/api/my-trips', { headers: headers(await cookieFor(userId)) }) })
  }

  it('lists joined trips by recap token, title (trip link scrubbed) and place, with no trip id anywhere', async () => {
    const w = contributorWorld()
    const res = await myTrips(w, SAM.id)
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
    const text = await res.text()
    expect(containsTripId(text)).toBe(false)
    const body = JSON.parse(text) as { trips: unknown[]; joined: unknown[] }
    expect(body.trips).toEqual([])
    expect(body.joined).toEqual([
      { recapToken: ACTIVE_TOKEN, title: 'Dublin weekend https://trip-one.pages.dev/trip/', displayName: 'Dublin, Ireland' },
    ])
  })

  it('leaves out a joined trip whose recap links are all revoked', async () => {
    const w = contributorWorld()
    w.exec("UPDATE trip_recap_links SET revoked_at = '2026-09-10T00:00:00.000Z' WHERE trip_id = ?", TRIP_ID)
    const body = (await (await myTrips(w, SAM.id)).json()) as { joined: unknown[] }
    expect(body.joined).toEqual([])
  })

  it('returns an empty joined list for someone who joined nothing (the owner)', async () => {
    const w = contributorWorld()
    const body = (await (await myTrips(w, OWNER.id)).json()) as { trips: unknown[]; joined: unknown[] }
    expect(body.joined).toEqual([])
    expect(body.trips).toHaveLength(2)
  })
})
