import { sqliteD1, type SqliteD1 } from './testSqliteD1'
import { fakeR2, type FakeR2 } from './testD1'
import { signToken } from './auth/jwt'
import { SESSION_COOKIE } from './auth/session'

/**
 * Fixtures for the contributor endpoints, over a REAL in-memory SQLite with
 * every migration applied (so trip_members, uploader_user_id and the WHERE
 * clauses are the production SQL, not a restatement of it) and a Map-backed
 * R2 bucket.
 *
 * The world: TRIP_ID owned by OWNER, with SAM and JO as members, one active
 * and one revoked recap link; OTHER_TRIP_ID with its own active link, where
 * only OUTSIDER is a member. TRIP_ID's itinerary has two uuid stops and a
 * legacy stop with no id. Photos: one uploaded by the owner through the trip
 * link (no uploader), one by SAM, one by JO.
 *
 * All values are synthetic unit-test values; none render in the product.
 */

/** Synthetic signing secret for tests only. */
export const TEST_JWT_SECRET = 'test-signing-secret-for-contributors-0000'

export const TRIP_ID = 'c0ffee00-0000-4000-8000-00000000000a'
export const OTHER_TRIP_ID = 'c0ffee00-0000-4000-8000-00000000000b'
export const STOP_A = '5a0b1c2d-0000-4000-8000-0000000000a1'
export const STOP_B = '5a0b1c2d-0000-4000-8000-0000000000a2'
export const OTHER_STOP = '5a0b1c2d-0000-4000-8000-0000000000b1'
export const ACTIVE_TOKEN = 'contribActiveTokenAAAAAAAAAAAAAAAAAAAAAAAAA'
export const REVOKED_TOKEN = 'contribRevokedTokenAAAAAAAAAAAAAAAAAAAAAAAA'
export const OTHER_TOKEN = 'contribOtherTripTokenAAAAAAAAAAAAAAAAAAAAAA'
/** A well-formed token that no link row holds. */
export const UNKNOWN_TOKEN = 'Z'.repeat(43)

export const OWNER = { id: 'u-owner-0001', email: 'owner@example.com' }
export const SAM = { id: 'u-sam-0001', email: 'sam@example.com' }
export const JO = { id: 'u-jo-0001', email: 'jo@example.com' }
export const OUTSIDER = { id: 'u-outsider-0001', email: 'outsider@example.com' }

export const OWNER_PHOTO = '9f000000-0000-4000-8000-0000000000c1'
export const SAM_PHOTO = '9f000000-0000-4000-8000-0000000000c2'
export const JO_PHOTO = '9f000000-0000-4000-8000-0000000000c3'
export const OTHER_TRIP_PHOTO = '9f000000-0000-4000-8000-0000000000c4'

/** Leading bytes of a JPEG (SOI + APP0/JFIF header). */
export const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00])

/** TRIP_ID's itinerary as stored: two uuid stops and one legacy stop without an id (public id `stop-1`). */
export const TRIP_ITINERARY = [
  { id: STOP_A, time: '09:00', text: 'Trinity College', type: 'fixed', day: 1 },
  { time: '12:00', text: 'Lunch', type: 'option', day: 1 },
  { id: STOP_B, time: '14:00', text: 'Chester Beatty Library', type: 'fixed', day: 2 },
]

export interface ContributorWorld extends SqliteD1 {
  r2: FakeR2
}

/**
 * Builds the world described above.
 * @returns The database, its env (with JWT_SECRET and the R2 fake) and the bucket
 */
export function contributorWorld(): ContributorWorld {
  const r2 = fakeR2()
  const db = sqliteD1({ JWT_SECRET: TEST_JWT_SECRET, PHOTOS: r2.bucket })
  db.exec(
    "INSERT INTO locations (slug, lat, lng, display_name) VALUES ('dublin-ireland', 53.35, -6.26, 'Dublin, County Dublin, Leinster, Ireland')",
  )
  for (const user of [OWNER, SAM, JO, OUTSIDER]) {
    db.exec(
      "INSERT INTO users (id, email, password_hash, display_name, created_at, token_version, email_verified) VALUES (?, ?, 'unused', NULL, '2026-09-01T00:00:00.000Z', 0, 1)",
      user.id,
      user.email,
    )
  }
  db.exec(
    "INSERT INTO trips (id, location_slug, itinerary, design_style, created_at, user_id, title) VALUES (?, 'dublin-ireland', ?, 'chronicle', '2026-09-01T00:00:00.000Z', ?, ?)",
    TRIP_ID,
    JSON.stringify(TRIP_ITINERARY),
    OWNER.id,
    `Dublin weekend https://trip-one.pages.dev/trip/${TRIP_ID}`,
  )
  db.exec(
    "INSERT INTO trips (id, location_slug, itinerary, design_style, created_at, user_id, title) VALUES (?, 'dublin-ireland', ?, 'chronicle', '2026-09-01T00:00:00.000Z', ?, 'Other trip')",
    OTHER_TRIP_ID,
    JSON.stringify([{ id: OTHER_STOP, time: '09:00', text: 'Other stop', type: 'fixed', day: 1 }]),
    OWNER.id,
  )
  const link = 'INSERT INTO trip_recap_links (token, trip_id, created_at, revoked_at) VALUES (?, ?, ?, ?)'
  db.exec(link, REVOKED_TOKEN, TRIP_ID, '2026-09-02T00:00:00.000Z', '2026-09-03T00:00:00.000Z')
  db.exec(link, ACTIVE_TOKEN, TRIP_ID, '2026-09-04T00:00:00.000Z', null)
  db.exec(link, OTHER_TOKEN, OTHER_TRIP_ID, '2026-09-04T00:00:00.000Z', null)

  const member = "INSERT INTO trip_members (trip_id, user_id, role, created_at) VALUES (?, ?, 'contributor', ?)"
  db.exec(member, TRIP_ID, SAM.id, 1_790_000_000_000)
  db.exec(member, TRIP_ID, JO.id, 1_790_000_000_001)
  db.exec(member, OTHER_TRIP_ID, OUTSIDER.id, 1_790_000_000_002)

  const photo = `INSERT INTO trip_photos (id, trip_id, stop_id, r2_key, content_type, width, height, bytes, created_at, uploader_user_id)
                 VALUES (?, ?, ?, ?, 'image/jpeg', 800, 600, 14, ?, ?)`
  const photos: [string, string, string, string | null][] = [
    [OWNER_PHOTO, TRIP_ID, STOP_A, null],
    [SAM_PHOTO, TRIP_ID, STOP_A, SAM.id],
    [JO_PHOTO, TRIP_ID, STOP_B, JO.id],
    [OTHER_TRIP_PHOTO, OTHER_TRIP_ID, OTHER_STOP, OUTSIDER.id],
  ]
  photos.forEach(([id, tripId, stopId, uploader], index) => {
    const key = `trips/${tripId}/${id}`
    db.exec(photo, id, tripId, stopId, key, `2026-10-05T09:0${index}:00.000Z`, uploader)
    r2.objects.set(key, { bytes: new Uint8Array(JPEG_BYTES), contentType: 'image/jpeg' })
  })
  return { ...db, r2 }
}

/**
 * A Cookie header signed in as this user.
 * @param userId - The user
 */
export async function cookieFor(userId: string): Promise<string> {
  return `${SESSION_COOKIE}=${await signToken(userId, 0, TEST_JWT_SECRET)}`
}

/**
 * Asserts nothing in a response body names either trip, in any letter case.
 * @param text - The body text
 */
export function containsTripId(text: string): boolean {
  const lower = text.toLowerCase()
  return [TRIP_ID, OTHER_TRIP_ID].some((id) => lower.includes(id.toLowerCase()))
}
