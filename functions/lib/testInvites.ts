import { fakeD1, type FakeD1 } from './testD1'
import type { RecapLinkRow, TripInviteRow, UserRow } from './db'
import { signToken } from './auth/jwt'
import { SESSION_COOKIE } from './auth/session'
import {
  tripRow,
  TRIP_ID,
  OTHER_TRIP_ID,
  ACTIVE_TOKEN,
  REVOKED_TOKEN,
  OTHER_TOKEN,
  RAW_DISPLAY_NAME,
} from './testRecap'

/**
 * A stateful fake D1 for the invite and join tests.
 *
 * It keeps `trips`, `locations`, `users`, `trip_recap_links`, `trip_invites`,
 * `trip_members` and `request_log` in memory and honours the WHERE clause of
 * every statement the code path runs (trip scope, email, `revoked_at IS NULL`,
 * `accepted_at IS NULL`, the unique keys), so a query that dropped one of
 * those conditions would be caught rather than papered over. Any statement it
 * does not recognise throws, so new SQL cannot silently no-op in a test.
 *
 * All values are synthetic unit-test values; none render in the product.
 */

export { TRIP_ID, OTHER_TRIP_ID, ACTIVE_TOKEN, REVOKED_TOKEN, OTHER_TOKEN, RAW_DISPLAY_NAME }

/** Synthetic signing secret for tests only. */
export const TEST_JWT_SECRET = 'test-signing-secret-for-invites-000000'

export interface TripMemberRow {
  trip_id: string
  user_id: string
  role: string
  created_at: number
}

export interface InviteStore {
  fake: FakeD1
  trips: Record<string, Record<string, unknown>>
  users: UserRow[]
  links: RecapLinkRow[]
  invites: TripInviteRow[]
  members: TripMemberRow[]
  requestLog: { ipHash: string; endpoint: string; createdAt: string }[]
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
 * Builds the in-memory store: TRIP_ID (with an active and a revoked recap
 * link) and OTHER_TRIP_ID (with its own active link), no users, no invites.
 * @param extraEnv - Extra env fields (mail config); JWT_SECRET is always set
 * @param failWhen - Statements for which this returns true throw, to simulate a D1 failure on just those
 */
export function inviteStore(
  extraEnv: Record<string, unknown> = {},
  failWhen: (sql: string) => boolean = () => false,
): InviteStore {
  const trips: Record<string, Record<string, unknown>> = {
    [TRIP_ID]: tripRow(TRIP_ID, []),
    [OTHER_TRIP_ID]: tripRow(OTHER_TRIP_ID, [], { title: 'Other trip' }),
  }
  const locations: Record<string, Record<string, unknown>> = {
    'dublin-ireland': { slug: 'dublin-ireland', lat: 53.35, lng: -6.26, display_name: RAW_DISPLAY_NAME },
  }
  const users: UserRow[] = []
  const links: RecapLinkRow[] = [
    { token: REVOKED_TOKEN, trip_id: TRIP_ID, created_at: '2026-09-02T00:00:00.000Z', revoked_at: '2026-09-03T00:00:00.000Z' },
    { token: ACTIVE_TOKEN, trip_id: TRIP_ID, created_at: '2026-09-04T00:00:00.000Z', revoked_at: null },
    { token: OTHER_TOKEN, trip_id: OTHER_TRIP_ID, created_at: '2026-09-04T00:00:00.000Z', revoked_at: null },
  ]
  const invites: TripInviteRow[] = []
  const members: TripMemberRow[] = []
  const requestLog: { ipHash: string; endpoint: string; createdAt: string }[] = []

  const inviteCols = 'id, trip_id, email, created_at, accepted_user_id, accepted_at, revoked_at, last_sent_at'

  const first = (sql: string, args: unknown[]): unknown => {
    if (failWhen(sql)) throw new Error('D1 unavailable')
    if (sql.includes('FROM request_log WHERE ip_hash = ? AND endpoint = ?')) {
      const [ipHash, endpoint, since] = args as [string, string, string]
      return { n: requestLog.filter((r) => r.ipHash === ipHash && r.endpoint === endpoint && r.createdAt >= since).length }
    }
    if (sql === 'SELECT * FROM trips WHERE id = ?') return trips[args[0] as string] ?? null
    if (sql === 'SELECT * FROM locations WHERE slug = ?') return locations[args[0] as string] ?? null
    if (sql === 'SELECT * FROM users WHERE id = ?') return users.find((u) => u.id === args[0]) ?? null
    if (sql === 'SELECT token, trip_id, created_at, revoked_at FROM trip_recap_links WHERE token = ? AND revoked_at IS NULL') {
      return links.find((l) => l.token === args[0] && l.revoked_at === null) ?? null
    }
    if (sql.includes('FROM trip_recap_links') && sql.includes('WHERE trip_id = ? AND revoked_at IS NULL')) {
      return activeLinksFor(links, args[0])[0] ?? null
    }
    if (sql === `SELECT ${inviteCols} FROM trip_invites WHERE trip_id = ? AND email = ?`) {
      const found = invites.find((i) => i.trip_id === args[0] && i.email === args[1])
      return found ? { ...found } : null
    }
    if (sql === `SELECT ${inviteCols} FROM trip_invites WHERE trip_id = ? AND email = ? AND revoked_at IS NULL`) {
      const found = invites.find((i) => i.trip_id === args[0] && i.email === args[1] && i.revoked_at === null)
      return found ? { ...found } : null
    }
    if (sql === `SELECT ${inviteCols} FROM trip_invites WHERE id = ? AND trip_id = ?`) {
      const found = invites.find((i) => i.id === args[0] && i.trip_id === args[1])
      return found ? { ...found } : null
    }
    if (sql === 'SELECT COUNT(*) AS n FROM trip_invites WHERE trip_id = ? AND revoked_at IS NULL') {
      return { n: invites.filter((i) => i.trip_id === args[0] && i.revoked_at === null).length }
    }
    const sentSince = (i: TripInviteRow, since: unknown) => i.last_sent_at !== null && i.last_sent_at >= (since as number)
    if (sql === 'SELECT COUNT(*) AS n FROM trip_invites WHERE trip_id = ? AND last_sent_at >= ?') {
      return { n: invites.filter((i) => i.trip_id === args[0] && sentSince(i, args[1])).length }
    }
    if (sql === 'SELECT COUNT(*) AS n FROM trip_invites WHERE email = ? AND last_sent_at >= ?') {
      return { n: invites.filter((i) => i.email === args[0] && sentSince(i, args[1])).length }
    }
    if (sql === 'SELECT COUNT(*) AS n FROM trip_invites WHERE last_sent_at >= ?') {
      return { n: invites.filter((i) => sentSince(i, args[0])).length }
    }
    throw new Error(`inviteStore: unexpected first() SQL: ${sql}`)
  }

  const all = (sql: string, args: unknown[]): unknown[] => {
    if (failWhen(sql)) throw new Error('D1 unavailable')
    if (
      sql ===
      `SELECT ${inviteCols} FROM trip_invites WHERE trip_id = ? AND revoked_at IS NULL ORDER BY created_at ASC, id ASC`
    ) {
      return invites
        .filter((i) => i.trip_id === args[0] && i.revoked_at === null)
        .sort((a, b) => a.created_at - b.created_at || a.id.localeCompare(b.id))
        .map((i) => ({ ...i }))
    }
    throw new Error(`inviteStore: unexpected all() SQL: ${sql}`)
  }

  const run = (sql: string, args: unknown[]): number => {
    if (failWhen(sql)) throw new Error('D1 unavailable')
    if (sql.startsWith('INSERT INTO request_log')) {
      const [ipHash, endpoint, createdAt] = args as [string, string, string]
      requestLog.push({ ipHash, endpoint, createdAt })
      return 1
    }
    if (sql.includes('INSERT INTO trip_recap_links') && sql.includes('NOT EXISTS')) {
      const [token, tripId, createdAt, guardTripId] = args as string[]
      if (activeLinksFor(links, guardTripId).length > 0) return 0
      links.push({ token, trip_id: tripId, created_at: createdAt, revoked_at: null })
      return 1
    }
    if (sql.includes('INSERT INTO trip_invites') && sql.includes('ON CONFLICT (trip_id, email) DO UPDATE SET revoked_at = NULL')) {
      const [id, tripId, email, createdAt] = args as [string, string, string, number]
      const existing = invites.find((i) => i.trip_id === tripId && i.email === email)
      if (existing) {
        existing.revoked_at = null
        return 1
      }
      if (invites.some((i) => i.id === id)) throw new Error('UNIQUE constraint failed: trip_invites.id')
      invites.push({
        id,
        trip_id: tripId,
        email,
        created_at: createdAt,
        accepted_user_id: null,
        accepted_at: null,
        revoked_at: null,
        last_sent_at: null,
      })
      return 1
    }
    if (
      sql ===
      'UPDATE trip_invites SET revoked_at = COALESCE(revoked_at, ?) WHERE id = ? AND trip_id = ? AND accepted_at IS NULL'
    ) {
      const [revokedAt, id, tripId] = args as [number, string, string]
      const row = invites.find((i) => i.id === id && i.trip_id === tripId && i.accepted_at === null)
      if (!row) return 0
      row.revoked_at = row.revoked_at ?? revokedAt
      return 1
    }
    if (sql === 'UPDATE trip_invites SET accepted_user_id = ?, accepted_at = ? WHERE id = ? AND accepted_at IS NULL') {
      const [userId, acceptedAt, id] = args as [string, number, string]
      const row = invites.find((i) => i.id === id && i.accepted_at === null)
      if (!row) return 0
      row.accepted_user_id = userId
      row.accepted_at = acceptedAt
      return 1
    }
    if (sql === 'UPDATE trip_invites SET last_sent_at = ? WHERE id = ? AND (last_sent_at IS NULL OR last_sent_at <= ?)') {
      const [nowMs, id, cutoff] = args as [number, string, number]
      const row = invites.find((i) => i.id === id && (i.last_sent_at === null || i.last_sent_at <= cutoff))
      if (!row) return 0
      row.last_sent_at = nowMs
      return 1
    }
    if (sql.includes('INSERT INTO trip_members') && sql.includes('ON CONFLICT (trip_id, user_id) DO NOTHING')) {
      const [tripId, userId, createdAt] = args as [string, string, number]
      if (members.some((m) => m.trip_id === tripId && m.user_id === userId)) return 0
      members.push({ trip_id: tripId, user_id: userId, role: 'contributor', created_at: createdAt })
      return 1
    }
    throw new Error(`inviteStore: unexpected run() SQL: ${sql}`)
  }

  const fake = fakeD1({ first, all, run, extraEnv: { JWT_SECRET: TEST_JWT_SECRET, ...extraEnv } })
  return { fake, trips, users, links, invites, members, requestLog }
}

/**
 * Adds a user row to the store and returns a Cookie header that signs in as them.
 * @param store - The store to add to
 * @param user - `email` as stored, and whether it is verified
 */
export async function signedInAs(
  store: InviteStore,
  user: { id: string; email: string; verified: boolean },
): Promise<string> {
  store.users.push({
    id: user.id,
    email: user.email,
    password_hash: 'unused-in-these-tests',
    display_name: null,
    created_at: '2026-09-01T00:00:00.000Z',
    token_version: 0,
    email_verified: user.verified ? 1 : 0,
  })
  return `${SESSION_COOKIE}=${await signToken(user.id, 0, TEST_JWT_SECRET)}`
}
