import { fakeD1, fakeR2, type FakeR2 } from './testD1'
import type { PhotoRow } from './db'

/**
 * Shared fixtures for the photo endpoint tests: a trip whose itinerary has two
 * stops (plus one legacy item with no id), and a stateful fake D1 whose trip_photos lookups honour the WHERE
 * clause they are given, so a query that forgot to scope by trip would be
 * caught rather than papered over by the fake.
 */

export const TRIP_ID = 'a1b2c3d4-0000-4000-8000-00000000000a'
export const OTHER_TRIP_ID = 'a1b2c3d4-0000-4000-8000-00000000000b'
export const STOP_ID = '5a0b1c2d-0000-4000-8000-000000000001'
/** A second stop that is in the itinerary. */
export const SECOND_STOP_ID = '5a0b1c2d-0000-4000-8000-000000000002'
/** A stop that was removed from the itinerary; photos on it are orphans. */
export const REMOVED_STOP_ID = '5a0b1c2d-0000-4000-8000-0000000000dd'
export const PHOTO_ID = '9f000000-0000-4000-8000-000000000001'

/** A trips row shaped as D1 returns it (itinerary as JSON TEXT). */
export const tripRow = {
  id: TRIP_ID,
  location_slug: 'dublin-ireland',
  itinerary: JSON.stringify([
    { time: '09:00', text: 'Trinity College', type: 'fixed', id: STOP_ID },
    { time: '12:00', text: 'Lunch', type: 'option' },
    { time: '14:00', text: 'Chester Beatty Library', type: 'fixed', id: SECOND_STOP_ID },
  ]),
  design_style: 'chronicle',
  created_at: '2026-09-01T00:00:00.000Z',
  trip_length_days: 1,
  start_date: null,
}

export interface PhotoEnvOptions {
  /** Requests already logged this hour for the rate-limited endpoint. */
  recentRequests?: number
  /** Photos already on the stop. */
  stopPhotoCount?: number
  /** Rows in trip_photos. */
  photos?: PhotoRow[]
  /** Whether the trip exists. */
  tripExists?: boolean
  /** The R2 fake to bind as PHOTOS. */
  r2?: FakeR2
  /** Throw from `.run()` for statements matching this SQL fragment. */
  runFailsOn?: string
}

/**
 * Builds a fake env for the photo endpoints.
 * @param options - What the fake database and bucket should contain
 */
export function photoEnv(options: PhotoEnvOptions = {}) {
  const r2 = options.r2 ?? fakeR2()
  const photos = options.photos ?? []
  const d1 = fakeD1({
    first: (sql, args) => {
      if (sql.includes('FROM request_log')) return { n: options.recentRequests ?? 0 }
      if (sql.includes('FROM trips')) return options.tripExists === false || args[0] !== TRIP_ID ? null : tripRow
      if (sql.includes('COUNT(*)') && sql.includes('stop_id = ?')) return { n: options.stopPhotoCount ?? 0 }
      // A whole-trip count, answered honestly from the rows, so an implementation
      // that counted orphans on removed stops toward the trip cap would be caught.
      if (sql.includes('COUNT(*)') && sql.includes('FROM trip_photos')) return { n: photos.filter((p) => p.trip_id === args[0]).length }
      if (sql.includes('FROM trip_photos WHERE id = ?')) {
        const scopedToTrip = sql.includes('trip_id = ?')
        return photos.find((p) => p.id === args[0] && (!scopedToTrip || p.trip_id === args[1])) ?? null
      }
      return null
    },
    all: (sql, args) => (sql.includes('FROM trip_photos') ? photos.filter((p) => p.trip_id === args[0]) : []),
    run: (sql) => {
      if (options.runFailsOn && sql.includes(options.runFailsOn)) throw new Error('D1 write failed')
      return undefined
    },
    extraEnv: { PHOTOS: r2.bucket },
  })
  return { ...d1, r2 }
}

/** Leading bytes of a JPEG (SOI + APP0/JFIF header). */
export const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00])
/** Leading bytes of a PNG (signature + start of IHDR). */
export const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d])
/** An HTML page — the payload a type-confusion attack would upload. */
export const HTML_BYTES = new TextEncoder().encode('<!doctype html><script>alert(document.cookie)</script>')

/** A stored photo row on TRIP_ID. */
export function photoRow(overrides: Partial<PhotoRow> = {}): PhotoRow {
  const id = overrides.id ?? PHOTO_ID
  const tripId = overrides.trip_id ?? TRIP_ID
  return {
    id,
    trip_id: tripId,
    stop_id: STOP_ID,
    r2_key: `trips/${tripId}/${id}`,
    content_type: 'image/jpeg',
    width: 800,
    height: 600,
    bytes: JPEG_BYTES.byteLength,
    created_at: '2026-09-28T10:00:00.000Z',
    ...overrides,
  }
}
