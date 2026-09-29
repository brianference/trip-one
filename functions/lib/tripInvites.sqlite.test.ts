// @vitest-environment node
// Runs against REAL SQLite with the production schema and migrations, so these
// tests prove what the claim statement itself enforces, not what a fake restates.
import { describe, it, expect } from 'vitest'
import { sqliteD1, type SqliteD1 } from './testSqliteD1'
import {
  claimInviteSend,
  releaseInviteSend,
  INVITE_SEND_WINDOW_MS,
  MAX_INVITE_SENDS_GLOBAL,
  MAX_INVITE_SENDS_PER_RECIPIENT,
  MAX_INVITE_SENDS_PER_TRIP,
} from './tripInvites'
import type { TripInviteRow } from './db'

const NOW = 1_790_000_000_000
const IN_WINDOW = NOW - 60_000
const TRIP_A = 'a1b2c3d4-0000-4000-8000-00000000000a'
const TRIP_B = 'a1b2c3d4-0000-4000-8000-00000000000b'
const SAM = 'sam@example.com'

/**
 * A fresh database with one location and the given trips.
 * @param tripIds - Trips to create
 */
function database(tripIds: string[]): SqliteD1 {
  const d1 = sqliteD1()
  d1.exec("INSERT INTO locations (slug, lat, lng, display_name) VALUES ('dublin-ireland', 53.35, -6.26, 'Dublin, Ireland')")
  for (const id of tripIds) {
    d1.exec(
      "INSERT INTO trips (id, location_slug, itinerary, design_style, created_at) VALUES (?, 'dublin-ireland', '[]', 'chronicle', '2026-09-01')",
      id,
    )
  }
  return d1
}

let counter = 0

/**
 * Inserts an invite row and returns it as the endpoint would have read it.
 * @param d1 - The database
 * @param row - trip, email and last send time
 */
function invite(d1: SqliteD1, row: { trip: string; email?: string; lastSentAt?: number | null }): TripInviteRow {
  counter += 1
  const full: TripInviteRow = {
    id: `b7000000-0000-4000-8000-${String(counter).padStart(12, '0')}`,
    trip_id: row.trip,
    email: row.email ?? `guest-${counter}@example.com`,
    created_at: NOW - 1_000_000,
    accepted_user_id: null,
    accepted_at: null,
    revoked_at: null,
    last_sent_at: row.lastSentAt ?? null,
  }
  d1.exec(
    'INSERT INTO trip_invites (id, trip_id, email, created_at, last_sent_at) VALUES (?, ?, ?, ?, ?)',
    full.id,
    full.trip_id,
    full.email,
    full.created_at,
    full.last_sent_at,
  )
  return full
}

/**
 * The stored last_sent_at of an invite.
 * @param d1 - The database
 * @param id - Invite id
 */
function lastSentAt(d1: SqliteD1, id: string): number | null {
  return d1.rows<{ last_sent_at: number | null }>('SELECT last_sent_at FROM trip_invites WHERE id = ?', id)[0].last_sent_at
}

/**
 * The count a request would have pre-read before claiming: its view of the cap.
 * @param d1 - The database
 * @param where - Extra condition
 * @param params - Its parameters
 */
function staleCount(d1: SqliteD1, where: string, ...params: string[]): number {
  const windowStart = NOW - INVITE_SEND_WINDOW_MS
  return d1.rows<{ n: number }>(
    `SELECT COUNT(*) AS n FROM trip_invites WHERE ${where} last_sent_at > ?`,
    ...params,
    String(windowStart),
  )[0].n
}

describe('claimInviteSend on real SQLite: the one UPDATE enforces every cap', () => {
  it('lets only one of two racing claims take the last per-trip slot, though both pre-read room', async () => {
    const d1 = database([TRIP_A])
    for (let i = 0; i < MAX_INVITE_SENDS_PER_TRIP - 1; i += 1) invite(d1, { trip: TRIP_A, lastSentAt: IN_WINDOW })
    const first = invite(d1, { trip: TRIP_A })
    const second = invite(d1, { trip: TRIP_A })

    // Both requests read the count before either claims: each sees one free slot.
    const seenByFirst = staleCount(d1, 'trip_id = ? AND', TRIP_A)
    const seenBySecond = staleCount(d1, 'trip_id = ? AND', TRIP_A)
    expect([seenByFirst, seenBySecond]).toEqual([MAX_INVITE_SENDS_PER_TRIP - 1, MAX_INVITE_SENDS_PER_TRIP - 1])

    const [a, b] = await Promise.all([claimInviteSend(d1.env, first, NOW), claimInviteSend(d1.env, second, NOW)])
    expect(a.send).toBe(true)
    expect(b).toEqual({ send: false, reason: 'daily_limit' })
    expect(lastSentAt(d1, second.id)).toBeNull()
    expect(staleCount(d1, 'trip_id = ? AND', TRIP_A)).toBe(MAX_INVITE_SENDS_PER_TRIP)
  })

  it('lets only one of two racing claims to the same address, on different trips, take its last slot', async () => {
    const d1 = database([TRIP_A, TRIP_B, 'a1b2c3d4-0000-4000-8000-0000000000c1', 'a1b2c3d4-0000-4000-8000-0000000000c2'])
    invite(d1, { trip: 'a1b2c3d4-0000-4000-8000-0000000000c1', email: SAM, lastSentAt: IN_WINDOW })
    invite(d1, { trip: 'a1b2c3d4-0000-4000-8000-0000000000c2', email: SAM, lastSentAt: IN_WINDOW })
    expect(MAX_INVITE_SENDS_PER_RECIPIENT - 2).toBe(1)
    const onA = invite(d1, { trip: TRIP_A, email: SAM })
    const onB = invite(d1, { trip: TRIP_B, email: SAM })

    const [a, b] = await Promise.all([claimInviteSend(d1.env, onA, NOW), claimInviteSend(d1.env, onB, NOW)])
    expect([a.send, b.send].filter(Boolean)).toHaveLength(1)
    expect(b).toEqual({ send: false, reason: 'daily_limit' })
    expect(staleCount(d1, 'email = ? AND', SAM)).toBe(MAX_INVITE_SENDS_PER_RECIPIENT)
  })

  it('lets only one of two racing claims take the last app-wide slot', async () => {
    // Spread earlier sends over many trips so no per-trip cap is reached first.
    const perTrip = MAX_INVITE_SENDS_PER_TRIP - 1
    const tripCount = Math.ceil((MAX_INVITE_SENDS_GLOBAL - 1) / perTrip)
    const trips = Array.from({ length: tripCount }, (_, i) => `a1b2c3d4-0000-4000-8000-${String(1000 + i).padStart(12, '0')}`)
    const d1 = database([...trips, TRIP_A])
    for (let sent = 0; sent < MAX_INVITE_SENDS_GLOBAL - 1; sent += 1) {
      invite(d1, { trip: trips[Math.floor(sent / perTrip)], lastSentAt: IN_WINDOW })
    }
    expect(staleCount(d1, '')).toBe(MAX_INVITE_SENDS_GLOBAL - 1)
    const first = invite(d1, { trip: TRIP_A })
    const second = invite(d1, { trip: TRIP_A })

    const [a, b] = await Promise.all([claimInviteSend(d1.env, first, NOW), claimInviteSend(d1.env, second, NOW)])
    expect(a.send).toBe(true)
    expect(b).toEqual({ send: false, reason: 'daily_limit' })
    expect(staleCount(d1, '')).toBe(MAX_INVITE_SENDS_GLOBAL)
  })

  it('lets only one of two racing claims send the same invite, and names the loser recently_sent', async () => {
    const d1 = database([TRIP_A])
    const row = invite(d1, { trip: TRIP_A, email: SAM })
    const [a, b] = await Promise.all([claimInviteSend(d1.env, row, NOW), claimInviteSend(d1.env, { ...row }, NOW)])
    expect(a.send).toBe(true)
    expect(b).toEqual({ send: false, reason: 'recently_sent' })
  })

  it('does not count sends at or before the window start, and allows a re-send then', async () => {
    const d1 = database([TRIP_A])
    const windowStart = NOW - INVITE_SEND_WINDOW_MS
    for (let i = 0; i < MAX_INVITE_SENDS_PER_TRIP; i += 1) invite(d1, { trip: TRIP_A, lastSentAt: windowStart })
    const old = invite(d1, { trip: TRIP_A, lastSentAt: windowStart })
    expect((await claimInviteSend(d1.env, old, NOW)).send).toBe(true)
  })
})

describe('releaseInviteSend on real SQLite', () => {
  it('puts last_sent_at back to its previous value, freeing the budget and the re-send', async () => {
    const d1 = database([TRIP_A])
    const earlier = NOW - INVITE_SEND_WINDOW_MS - 5_000
    const row = invite(d1, { trip: TRIP_A, email: SAM, lastSentAt: earlier })
    const claim = await claimInviteSend(d1.env, row, NOW)
    if (!claim.send) throw new Error('expected the claim to succeed')
    expect(lastSentAt(d1, row.id)).toBe(NOW)

    await releaseInviteSend(d1.env, row.id, claim)
    expect(lastSentAt(d1, row.id)).toBe(earlier)
    expect((await claimInviteSend(d1.env, row, NOW + 1)).send).toBe(true)
  })

  it('does not undo a stamp that is not its own', async () => {
    const d1 = database([TRIP_A])
    const row = invite(d1, { trip: TRIP_A, email: SAM })
    await claimInviteSend(d1.env, row, NOW)
    await releaseInviteSend(d1.env, row.id, { claimedAtMs: NOW - 1, previousSentAtMs: null })
    expect(lastSentAt(d1, row.id)).toBe(NOW)
  })
})
