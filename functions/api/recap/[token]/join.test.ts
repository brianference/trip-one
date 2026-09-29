// @vitest-environment node
// Signing session JWTs needs Web Crypto's `subtle`, hence the node environment.
import { describe, it, expect } from 'vitest'
import { onRequestPost as join, JOIN_FORBIDDEN_MESSAGE, RECAP_JOINS_PER_HOUR } from './join'
import { onRequestGet as getRecap } from '../[token]'
import {
  inviteStore,
  signedInAs,
  TRIP_ID,
  OTHER_TRIP_ID,
  ACTIVE_TOKEN,
  REVOKED_TOKEN,
  type InviteStore,
} from '../../../lib/testInvites'
import { UNKNOWN_TOKEN } from '../../../lib/testRecap'
import type { TripInviteRow } from '../../../lib/db'

const SAM = { id: 'u-sam-0001', email: 'sam@example.com', verified: true }
const FORBIDDEN = { error: "This email isn't invited to this trip." }
const INVITE_ID = 'b7000000-0000-4000-8000-000000000001'

/** Adds an invite row to the store. */
function invite(s: InviteStore, overrides: Partial<TripInviteRow> = {}): TripInviteRow {
  const row: TripInviteRow = {
    id: INVITE_ID,
    trip_id: TRIP_ID,
    email: SAM.email,
    created_at: 1_790_000_000_000,
    accepted_user_id: null,
    accepted_at: null,
    revoked_at: null,
    last_sent_at: null,
    ...overrides,
  }
  s.invites.push(row)
  return row
}

/** POSTs a join for a token, optionally with a session cookie. */
function post(s: InviteStore, token: string, cookie?: string, ip = '203.0.113.20'): Promise<Response> {
  const headers: Record<string, string> = { 'CF-Connecting-IP': ip }
  if (cookie) headers.Cookie = cookie
  const request = new Request(`https://trip-one.pages.dev/api/recap/${token}/join`, { method: 'POST', headers })
  return join({ env: s.fake.env, request, params: { token } })
}

/** Reads a response as text and asserts it never names either trip, in any letter case. */
async function bodyWithoutTripIds(res: Response): Promise<string> {
  const text = await res.text()
  for (const id of [TRIP_ID, OTHER_TRIP_ID]) {
    expect(text.toLowerCase()).not.toContain(id.toLowerCase())
  }
  return text
}

/** Asserts a 403 with the fixed body, no trip id, no membership and no acceptance. */
async function expectForbidden(s: InviteStore, res: Response): Promise<void> {
  expect(res.status).toBe(403)
  expect(res.headers.get('Cache-Control')).toBe('private, no-store')
  expect(JSON.parse(await bodyWithoutTripIds(res))).toEqual(FORBIDDEN)
  expect(s.members).toEqual([])
  expect(s.invites.every((i) => i.accepted_at === null)).toBe(true)
}

describe('POST /api/recap/:token/join', () => {
  it('adds an invited, verified user as a member and answers {joined:true} with no trip id, uncached', async () => {
    const s = inviteStore()
    invite(s)
    const cookie = await signedInAs(s, SAM)
    const res = await post(s, ACTIVE_TOKEN, cookie)

    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
    expect(JSON.parse(await bodyWithoutTripIds(res))).toEqual({ joined: true })
    expect(s.members).toEqual([{ trip_id: TRIP_ID, user_id: SAM.id, role: 'contributor', created_at: expect.any(Number) }])
    expect(s.invites[0].accepted_user_id).toBe(SAM.id)
    expect(s.invites[0].accepted_at).toEqual(expect.any(Number))
  })

  it('is idempotent: joining again answers the same, adds no second membership and keeps the first acceptance', async () => {
    const s = inviteStore()
    invite(s)
    const cookie = await signedInAs(s, SAM)
    const first = await post(s, ACTIVE_TOKEN, cookie)
    const acceptedAt = s.invites[0].accepted_at
    const second = await post(s, ACTIVE_TOKEN, cookie)

    expect(second.status).toBe(200)
    expect(await bodyWithoutTripIds(second)).toBe(await bodyWithoutTripIds(first))
    expect(s.members).toHaveLength(1)
    expect(s.invites[0].accepted_at).toBe(acceptedAt)
  })

  it('matches the email case-insensitively when the stored account email has capitals', async () => {
    const s = inviteStore()
    invite(s, { email: 'sam@example.com' })
    const cookie = await signedInAs(s, { ...SAM, email: 'Sam@Example.COM' })
    const res = await post(s, ACTIVE_TOKEN, cookie)
    expect(res.status).toBe(200)
    expect(JSON.parse(await bodyWithoutTripIds(res))).toEqual({ joined: true })
  })

  it('answers 401 "Sign in first" when signed out, and joins nobody', async () => {
    const s = inviteStore()
    invite(s)
    const res = await post(s, ACTIVE_TOKEN)
    expect(res.status).toBe(401)
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
    expect(JSON.parse(await bodyWithoutTripIds(res))).toEqual({ error: 'Sign in first' })
    expect(s.members).toEqual([])
  })

  it('answers 401 for a session cookie that does not verify', async () => {
    const s = inviteStore()
    invite(s)
    const res = await post(s, ACTIVE_TOKEN, 'trip_one_session=not-a-real-token')
    expect(res.status).toBe(401)
    await bodyWithoutTripIds(res)
  })

  it('answers 403 when the invited email is not verified on the account', async () => {
    const s = inviteStore()
    invite(s)
    const cookie = await signedInAs(s, { ...SAM, verified: false })
    await expectForbidden(s, await post(s, ACTIVE_TOKEN, cookie))
  })

  it('answers 403 when the signed-in email has no invite', async () => {
    const s = inviteStore()
    invite(s, { email: 'someone-else@example.com' })
    const cookie = await signedInAs(s, SAM)
    await expectForbidden(s, await post(s, ACTIVE_TOKEN, cookie))
  })

  it('answers 403 when the invite has been revoked', async () => {
    const s = inviteStore()
    invite(s, { revoked_at: 1_790_000_100_000 })
    const cookie = await signedInAs(s, SAM)
    await expectForbidden(s, await post(s, ACTIVE_TOKEN, cookie))
  })

  it('answers 403 when the invite is for a different trip than the recap link', async () => {
    const s = inviteStore()
    invite(s, { trip_id: OTHER_TRIP_ID })
    const cookie = await signedInAs(s, SAM)
    await expectForbidden(s, await post(s, ACTIVE_TOKEN, cookie))
  })

  it('sends the same 403 body in every refusal, and it never contains the trip id', async () => {
    const bodies: string[] = []
    for (const setup of [
      async (s: InviteStore) => { invite(s); return signedInAs(s, { ...SAM, verified: false }) },
      async (s: InviteStore) => signedInAs(s, SAM),
      async (s: InviteStore) => { invite(s, { revoked_at: 1 }); return signedInAs(s, SAM) },
    ]) {
      const s = inviteStore()
      const res = await post(s, ACTIVE_TOKEN, await setup(s))
      expect(res.status).toBe(403)
      bodies.push(await bodyWithoutTripIds(res))
    }
    expect(new Set(bodies).size).toBe(1)
    expect(JOIN_FORBIDDEN_MESSAGE).toBe(FORBIDDEN.error)
    expect(JOIN_FORBIDDEN_MESSAGE.toLowerCase()).not.toContain(TRIP_ID.toLowerCase())
  })

  it.each([
    ['unknown', UNKNOWN_TOKEN],
    ['revoked', REVOKED_TOKEN],
    ['malformed', 'not-a-token'],
  ])('answers an %s token with exactly the recap GET 404, even when signed in and invited', async (_label, token) => {
    const s = inviteStore()
    invite(s)
    const cookie = await signedInAs(s, SAM)
    const res = await post(s, token, cookie)
    const recap = await getRecap({ env: s.fake.env, request: new Request(`https://x/api/recap/${token}`), params: { token } })

    expect(res.status).toBe(404)
    expect(recap.status).toBe(404)
    expect(await bodyWithoutTripIds(res)).toBe(await recap.text())
    expect(s.members).toEqual([])
  })

  it('answers the recap 404 when the link’s trip is gone', async () => {
    const s = inviteStore()
    invite(s)
    delete s.trips[TRIP_ID]
    const cookie = await signedInAs(s, SAM)
    const res = await post(s, ACTIVE_TOKEN, cookie)
    const recap = await getRecap({
      env: s.fake.env,
      request: new Request(`https://x/api/recap/${ACTIVE_TOKEN}`),
      params: { token: ACTIVE_TOKEN },
    })
    expect(res.status).toBe(404)
    expect(await bodyWithoutTripIds(res)).toBe(await recap.text())
    expect(s.members).toEqual([])
  })

  it(`rate-limits past ${RECAP_JOINS_PER_HOUR} joins per hour per IP under "recap-join"`, async () => {
    const s = inviteStore()
    invite(s)
    const cookie = await signedInAs(s, SAM)
    for (let i = 0; i < RECAP_JOINS_PER_HOUR; i += 1) {
      expect((await post(s, ACTIVE_TOKEN, cookie)).status).toBe(200)
    }
    const limited = await post(s, ACTIVE_TOKEN, cookie)
    expect(limited.status).toBe(429)
    await bodyWithoutTripIds(limited)
    expect(RECAP_JOINS_PER_HOUR).toBe(60)
    expect(s.requestLog.every((r) => r.endpoint === 'recap-join')).toBe(true)
    // A different IP still has its own budget.
    expect((await post(s, ACTIVE_TOKEN, cookie, '203.0.113.99')).status).toBe(200)
  })
})
