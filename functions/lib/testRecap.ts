import { fakeD1, fakeR2, type FakeR2 } from './testD1'
import type { PhotoRow, RecapLinkRow } from './db'
import { TRIP_ID, OTHER_TRIP_ID, STOP_ID, PHOTO_ID, photoRow } from './testPhotos'

/**
 * Shared fixtures for the recap endpoint tests: a stateful fake D1 whose
 * trip_recap_links and trip_photos lookups honour the WHERE clause they are
 * given (trip scope, `revoked_at IS NULL`), so a query that forgot either
 * would be caught rather than papered over by the fake.
 *
 * All values here are synthetic unit-test values; none render in the product.
 */

export { TRIP_ID, OTHER_TRIP_ID, STOP_ID, PHOTO_ID }

/** A second stop on TRIP_ID. */
export const SECOND_STOP_ID = '5a0b1c2d-0000-4000-8000-000000000002'
/** The only stop on OTHER_TRIP_ID. */
export const OTHER_STOP_ID = '5a0b1c2d-0000-4000-8000-0000000000b1'
/** A photo on OTHER_TRIP_ID. */
export const OTHER_PHOTO_ID = '9f000000-0000-4000-8000-0000000000b1'
/** A photo on TRIP_ID's second stop. */
export const SECOND_PHOTO_ID = '9f000000-0000-4000-8000-000000000002'
/** A well-formed token that no link row holds. */
export const UNKNOWN_TOKEN = 'A'.repeat(43)
/** An active token on TRIP_ID. */
export const ACTIVE_TOKEN = 'activeTokenForTripAAAAAAAAAAAAAAAAAAAAAAAAA'
/** A revoked token on TRIP_ID. */
export const REVOKED_TOKEN = 'revokedTokenForTripAAAAAAAAAAAAAAAAAAAAAAAA'
/** An active token on OTHER_TRIP_ID. */
export const OTHER_TOKEN = 'activeTokenForOtherTripAAAAAAAAAAAAAAAAAAAA'

/** The raw location display name, before cleanDisplayName trims the county. */
export const RAW_DISPLAY_NAME = 'Dublin, County Dublin, Leinster, Ireland'

/**
 * TRIP_ID's itinerary as stored. The day-2 stop comes first in the array so a
 * test can tell "itinerary order" apart from "sorted by day". The Viator stop
 * carries booking fields that must never reach a recap viewer.
 */
export const TRIP_ITINERARY = [
  {
    id: SECOND_STOP_ID,
    time: '10:00',
    text: 'Guinness Storehouse',
    type: 'option',
    day: 2,
    lat: 53.3419,
    lng: -6.2867,
    category: 'tourist_attraction',
    source: 'viator',
    productCode: 'TEST-PRODUCT',
    priceFrom: 30,
    currency: 'EUR',
    bookingUrl: `https://example.test/book?ref=${TRIP_ID}`,
  },
  { id: STOP_ID, time: '09:00', text: 'Trinity College', type: 'fixed', day: 1, lat: 53.3438, lng: -6.2546 },
]

/** A trips row shaped as D1 returns it (itinerary as JSON TEXT). */
export function tripRow(id: string, itinerary: unknown[], overrides: Record<string, unknown> = {}) {
  return {
    id,
    location_slug: 'dublin-ireland',
    itinerary: JSON.stringify(itinerary),
    design_style: 'chronicle',
    created_at: '2026-09-01T00:00:00.000Z',
    trip_length_days: 2,
    start_date: '2026-10-05',
    user_id: 'u-owner-0001',
    title: 'Dublin weekend',
    ...overrides,
  }
}

export interface RecapState {
  trips: Record<string, Record<string, unknown>>
  locations: Record<string, Record<string, unknown>>
  photos: PhotoRow[]
  links: RecapLinkRow[]
  /** Requests already logged this hour for the rate-limited endpoint. */
  recentRequests?: number
}

/** The default state: two trips, three photos, one active and one revoked link on TRIP_ID, one on OTHER_TRIP_ID. */
export function defaultRecapState(): RecapState {
  return {
    trips: {
      [TRIP_ID]: tripRow(TRIP_ID, TRIP_ITINERARY),
      [OTHER_TRIP_ID]: tripRow(OTHER_TRIP_ID, [{ id: OTHER_STOP_ID, time: '09:00', text: 'Other stop', type: 'fixed', day: 1 }]),
    },
    locations: {
      'dublin-ireland': { slug: 'dublin-ireland', lat: 53.35, lng: -6.26, display_name: RAW_DISPLAY_NAME },
    },
    photos: [
      photoRow({ created_at: '2026-10-05T09:30:00.000Z' }),
      photoRow({ id: SECOND_PHOTO_ID, stop_id: SECOND_STOP_ID, created_at: '2026-10-06T10:30:00.000Z' }),
      photoRow({ id: OTHER_PHOTO_ID, trip_id: OTHER_TRIP_ID, stop_id: OTHER_STOP_ID }),
    ],
    links: [
      { token: REVOKED_TOKEN, trip_id: TRIP_ID, created_at: '2026-09-02T00:00:00.000Z', revoked_at: '2026-09-03T00:00:00.000Z' },
      { token: ACTIVE_TOKEN, trip_id: TRIP_ID, created_at: '2026-09-04T00:00:00.000Z', revoked_at: null },
      { token: OTHER_TOKEN, trip_id: OTHER_TRIP_ID, created_at: '2026-09-04T00:00:00.000Z', revoked_at: null },
    ],
  }
}

/**
 * The active links on a trip, oldest first, as the SQL orders them.
 * @param links - Every link row
 * @param tripId - The trip
 */
function activeLinksFor(links: RecapLinkRow[], tripId: unknown): RecapLinkRow[] {
  return links
    .filter((l) => l.trip_id === tripId && l.revoked_at === null)
    .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.token.localeCompare(b.token))
}

/**
 * Builds a fake env for the recap endpoints over a mutable state.
 * @param state - What the fake database holds; mutated by writes
 * @param options - `r2` to bind as PHOTOS, `fail` to make every D1 call throw
 */
export function recapEnv(state: RecapState = defaultRecapState(), options: { r2?: FakeR2; fail?: boolean } = {}) {
  const r2 = options.r2 ?? fakeR2()
  const d1 = fakeD1({
    fail: options.fail,
    first: (sql, args) => {
      if (sql.includes('FROM request_log')) return { n: state.recentRequests ?? 0 }
      if (sql.includes('FROM trips WHERE id = ?')) return state.trips[args[0] as string] ?? null
      if (sql.includes('FROM locations WHERE slug = ?')) return state.locations[args[0] as string] ?? null
      if (sql.includes('FROM trip_recap_links')) {
        const activeOnly = sql.includes('revoked_at IS NULL')
        if (sql.includes('WHERE token = ?')) {
          return state.links.find((l) => l.token === args[0] && (!activeOnly || l.revoked_at === null)) ?? null
        }
        if (sql.includes('WHERE trip_id = ?') && activeOnly) return activeLinksFor(state.links, args[0])[0] ?? null
        return null
      }
      if (sql.includes('FROM trip_photos WHERE id = ?')) {
        const scopedToTrip = sql.includes('trip_id = ?')
        return state.photos.find((p) => p.id === args[0] && (!scopedToTrip || p.trip_id === args[1])) ?? null
      }
      return null
    },
    all: (sql, args) => (sql.includes('FROM trip_photos') ? state.photos.filter((p) => p.trip_id === args[0]) : []),
    run: (sql, args) => {
      if (sql.includes('INSERT INTO trip_recap_links')) {
        const [token, tripId, createdAt, guardTripId] = args as string[]
        if (!sql.includes('NOT EXISTS') || activeLinksFor(state.links, guardTripId).length === 0) {
          state.links.push({ token, trip_id: tripId, created_at: createdAt, revoked_at: null })
          return 1
        }
        return 0
      }
      if (sql.includes('UPDATE trip_recap_links SET revoked_at = ?')) {
        const [revokedAt, tripId] = args as string[]
        let changes = 0
        for (const link of state.links) {
          if (link.trip_id === tripId && link.revoked_at === null) {
            link.revoked_at = revokedAt
            changes += 1
          }
        }
        return changes
      }
      return undefined
    },
    extraEnv: { PHOTOS: r2.bucket },
  })
  return { ...d1, r2, state }
}
