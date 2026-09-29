// @vitest-environment node
import { describe, it, expect, vi, afterEach } from 'vitest'
import { onRequestGet, onRequestPost } from './index'
import { onRequestDelete } from './[inviteId]'
import {
  TRIP_INVITES_PER_HOUR,
  INVITE_SEND_WINDOW_MS,
  INVITE_SUBJECT,
  INVITES_UNAVAILABLE_MESSAGE,
  LIVE_INVITE_LIMIT_MESSAGE,
  MAX_INVITE_SENDS_GLOBAL,
  MAX_INVITE_SENDS_PER_RECIPIENT,
  MAX_INVITE_SENDS_PER_TRIP,
  MAX_LIVE_INVITES_PER_TRIP,
} from '../../../../lib/tripInvites'
import { inviteStore, TRIP_ID, OTHER_TRIP_ID, ACTIVE_TOKEN, type InviteStore } from '../../../../lib/testInvites'
import type { TripInviteRow } from '../../../../lib/db'
import { DEMO_TRIP_IDS } from '../../../../../src/lib/api/demoIds'
import { RECAP_TOKEN_LENGTH } from '../../../../lib/recapAccess'
import { logger } from '../../../../../src/lib/logger'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

/** Synthetic mail config; fetch is stubbed so nothing is sent. */
const MAIL = { SITE_URL: 'https://trip-one.pages.dev', MAIL_FROM: 'no-reply@txeas.com', BREVO_API_KEY: 'test-key' }
const UNKNOWN_TRIP_ID = 'a1b2c3d4-0000-4000-8000-0000000000ff'
const SAM = 'sam@example.com'
/** A moment inside the current 24-hour send window. */
const RECENTLY = () => Date.now() - 60_000
/** A moment just outside it. */
const LONG_AGO = () => Date.now() - INVITE_SEND_WINDOW_MS - 60_000

type Sent = { to: string; subject: string; html: string; text: string }

/** Stubs Brevo and returns the list of messages "sent". */
function stubMail(): Sent[] {
  const sent: Sent[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as {
        to: { email: string }[]
        subject: string
        htmlContent: string
        textContent: string
      }
      sent.push({ to: body.to[0].email, subject: body.subject, html: body.htmlContent, text: body.textContent })
      return new Response('{}', { status: 201 })
    }),
  )
  return sent
}

/**
 * A store with mail configured.
 * @param failWhen - Statements for which this returns true throw
 */
function store(failWhen?: (sql: string) => boolean): InviteStore {
  return inviteStore(MAIL, failWhen)
}

/**
 * Builds a Pages Function context for the invites collection route.
 * @param s - The store whose env to use
 * @param tripId - `params.id`
 * @param init - Request method and body
 * @param ip - The client address the rate limit keys on
 */
function ctx(s: InviteStore, tripId: string, init: RequestInit = {}, ip = '203.0.113.30') {
  const headers = { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip }
  return {
    env: s.fake.env,
    request: new Request(`https://trip-one.pages.dev/api/trips/${tripId}/invites`, { ...init, headers }),
    params: { id: tripId },
  }
}

/**
 * POSTs an invite.
 * @param s - The store
 * @param email - The body's `email` (any type, to test validation)
 * @param tripId - The trip to invite to
 * @param ip - The client address
 */
function invitePost(s: InviteStore, email: unknown, tripId = TRIP_ID, ip?: string): Promise<Response> {
  return onRequestPost(ctx(s, tripId, { method: 'POST', body: JSON.stringify({ email }) }, ip))
}

/**
 * GETs a trip's invite list.
 * @param s - The store
 * @param tripId - The trip
 */
function inviteList(s: InviteStore, tripId = TRIP_ID): Promise<Response> {
  return onRequestGet(ctx(s, tripId))
}

/**
 * DELETEs (revokes) one invite.
 * @param s - The store
 * @param inviteId - `params.inviteId`
 * @param tripId - `params.id`
 * @param ip - The client address
 */
function inviteDelete(s: InviteStore, inviteId: string, tripId = TRIP_ID, ip?: string): Promise<Response> {
  const base = ctx(s, tripId, { method: 'DELETE' }, ip)
  return onRequestDelete({ ...base, params: { id: tripId, inviteId } })
}

/**
 * Puts an invite row straight into the store, as if created and sent earlier.
 * @param s - The store
 * @param row - Fields to set; the rest are a pending, never-sent invite on TRIP_ID
 */
function seed(s: InviteStore, row: Partial<TripInviteRow>): TripInviteRow {
  const full: TripInviteRow = {
    id: crypto.randomUUID(),
    trip_id: TRIP_ID,
    email: `seed-${s.invites.length}@example.com`,
    created_at: 1_790_000_000_000,
    accepted_user_id: null,
    accepted_at: null,
    revoked_at: null,
    last_sent_at: null,
    ...row,
  }
  s.invites.push(full)
  return full
}

/**
 * The invite row for an address on a trip, which must exist.
 * @param s - The store
 * @param email - Normalized address
 * @param tripId - The trip
 */
function rowFor(s: InviteStore, email: string, tripId = TRIP_ID): TripInviteRow {
  const row = s.invites.find((i) => i.email === email && i.trip_id === tripId)
  if (!row) throw new Error(`no invite for ${email}`)
  return row
}

type PublicInvite = { id: string; email: string; createdAt: number; acceptedAt: number | null }
type InviteBody = { invite: PublicInvite; emailSent: boolean; reason?: string }

describe('POST /api/trips/:id/invites', () => {
  it('stores the normalized email, emails a recap invite link and answers 201 emailSent, uncached', async () => {
    const sent = stubMail()
    const s = store()
    const res = await invitePost(s, '  Sam@Example.COM ')

    expect(res.status).toBe(201)
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
    const body = (await res.json()) as InviteBody
    expect(body).toEqual({
      invite: { id: s.invites[0].id, email: SAM, createdAt: s.invites[0].created_at, acceptedAt: null },
      emailSent: true,
    })
    expect(s.invites).toHaveLength(1)
    expect(s.invites[0]).toMatchObject({ trip_id: TRIP_ID, email: SAM, revoked_at: null })
    expect(s.invites[0].last_sent_at).toEqual(expect.any(Number))

    expect(sent).toHaveLength(1)
    expect(sent[0].to).toBe(SAM)
    expect(sent[0].subject).toBe("You're invited to add photos on Trip One")
    // Fixed copy: the trip's title is not in the email.
    expect(sent[0].html).not.toContain('Dublin weekend')
    expect(sent[0].text).not.toContain('Dublin weekend')
    expect(sent[0].html).toContain("You're invited to add your photos to a trip on Trip One.")
    // The link is the existing active recap, never the trip itself.
    expect(sent[0].html).toContain(`https://trip-one.pages.dev/recap/${ACTIVE_TOKEN}?invite=1`)
    expect(sent[0].text).toContain(`https://trip-one.pages.dev/recap/${ACTIVE_TOKEN}?invite=1`)
    for (const part of [sent[0].html, sent[0].subject]) expect(part.toLowerCase()).not.toContain(TRIP_ID)
  })

  it('creates a recap link when the trip has none active, and reuses it for the next invite', async () => {
    const sent = stubMail()
    const s = store()
    s.links.splice(0, s.links.length, ...s.links.filter((l) => l.trip_id !== TRIP_ID))

    await invitePost(s, SAM)
    const active = s.links.filter((l) => l.trip_id === TRIP_ID && l.revoked_at === null)
    expect(active).toHaveLength(1)
    expect(active[0].token).toHaveLength(RECAP_TOKEN_LENGTH)
    expect(sent[0].html).toContain(`/recap/${active[0].token}?invite=1`)

    await invitePost(s, 'jo@example.com')
    expect(s.links.filter((l) => l.trip_id === TRIP_ID)).toHaveLength(1)
    expect(sent[1].html).toContain(`/recap/${active[0].token}?invite=1`)
  })

  it('keeps an attacker-chosen trip title out of the email entirely (subject and body)', async () => {
    const sent = stubMail()
    const s = store()
    s.trips[TRIP_ID].title = '<img src=x onerror=alert(1)> WIN A PRIZE & "claim"\r\nBcc: attacker@example.com'
    await invitePost(s, SAM)

    expect(sent[0].subject).toBe(INVITE_SUBJECT)
    for (const part of [sent[0].html, sent[0].text, sent[0].subject]) {
      expect(part).not.toContain('img src=x')
      expect(part).not.toContain('WIN A PRIZE')
      expect(part).not.toContain('attacker@example.com')
    }
  })

  it('strips the trip id from a title that contains the trip link', async () => {
    const sent = stubMail()
    const s = store()
    s.trips[TRIP_ID].title = `Lisbon https://trip-one.pages.dev/trip/${TRIP_ID.toUpperCase()}`
    await invitePost(s, SAM)
    for (const part of [sent[0].html, sent[0].text, sent[0].subject]) {
      expect(part.toLowerCase()).not.toContain(TRIP_ID.toLowerCase())
    }
  })

  it('sends the same body whatever the trip is called, with no place name either', async () => {
    const sent = stubMail()
    const s = store()
    await invitePost(s, SAM)
    s.trips[TRIP_ID].title = null
    await invitePost(s, 'jo@example.com')
    expect(sent[1].html).not.toContain('Dublin')
    expect(sent[1].html).toBe(sent[0].html)
  })

  describe('no re-send within 24 hours', () => {
    it('does not email a live invite again within 24 hours, but answers 201 recently_sent', async () => {
      const sent = stubMail()
      const s = store()
      await invitePost(s, SAM)
      const firstSend = rowFor(s, SAM).last_sent_at

      const again = await invitePost(s, SAM)
      expect(again.status).toBe(201)
      const body = (await again.json()) as InviteBody
      expect(body.emailSent).toBe(false)
      expect(body.reason).toBe('recently_sent')
      expect(body.invite.id).toBe(rowFor(s, SAM).id)
      expect(sent).toHaveLength(1)
      expect(rowFor(s, SAM).last_sent_at).toBe(firstSend)
    })

    it('emails it again once the last send is more than 24 hours old', async () => {
      const sent = stubMail()
      const s = store()
      seed(s, { email: SAM, last_sent_at: LONG_AGO() })
      const res = (await (await invitePost(s, SAM)).json()) as InviteBody
      expect(res.emailSent).toBe(true)
      expect(sent).toHaveLength(1)
      expect(rowFor(s, SAM).last_sent_at).toBeGreaterThan(Date.now() - INVITE_SEND_WINDOW_MS)
    })

    it('does not re-send when a revoked invite is brought back within 24 hours of its last send', async () => {
      const sent = stubMail()
      const s = store()
      const first = (await (await invitePost(s, SAM)).json()) as InviteBody
      expect((await inviteDelete(s, first.invite.id)).status).toBe(200)

      const again = (await (await invitePost(s, 'SAM@example.com')).json()) as InviteBody
      expect(again.invite.id).toBe(first.invite.id)
      expect(again.emailSent).toBe(false)
      expect(again.reason).toBe('recently_sent')
      expect(s.invites).toHaveLength(1)
      expect(s.invites[0].revoked_at).toBeNull()
      expect(sent).toHaveLength(1)
    })
  })

  describe('per-trip cap', () => {
    it(`stops sending after ${MAX_INVITE_SENDS_PER_TRIP} sends from one trip in 24 hours, still saving the invite`, async () => {
      const sent = stubMail()
      const s = store()
      for (let i = 0; i < MAX_INVITE_SENDS_PER_TRIP; i += 1) seed(s, { last_sent_at: RECENTLY() })
      seed(s, { trip_id: OTHER_TRIP_ID, last_sent_at: RECENTLY() })

      const res = await invitePost(s, SAM)
      expect(res.status).toBe(201)
      expect(await res.json()).toEqual({
        invite: expect.objectContaining({ email: SAM }),
        emailSent: false,
        reason: 'daily_limit',
      })
      expect(sent).toEqual([])
      expect(rowFor(s, SAM).last_sent_at).toBeNull()
      expect(MAX_INVITE_SENDS_PER_TRIP).toBe(20)
    })

    it('does not count sends older than 24 hours or sends from other trips', async () => {
      const sent = stubMail()
      const s = store()
      for (let i = 0; i < MAX_INVITE_SENDS_PER_TRIP - 1; i += 1) seed(s, { last_sent_at: RECENTLY() })
      seed(s, { last_sent_at: LONG_AGO() })
      seed(s, { trip_id: OTHER_TRIP_ID, last_sent_at: RECENTLY() })
      expect(((await (await invitePost(s, SAM)).json()) as InviteBody).emailSent).toBe(true)
      expect(sent).toHaveLength(1)
    })
  })

  describe('per-recipient cap', () => {
    it(`stops sending to an address after ${MAX_INVITE_SENDS_PER_RECIPIENT} invite emails in 24 hours across all trips`, async () => {
      const sent = stubMail()
      const s = store()
      for (let i = 0; i < MAX_INVITE_SENDS_PER_RECIPIENT; i += 1) {
        seed(s, { trip_id: `other-trip-${i}`, email: SAM, last_sent_at: RECENTLY() })
      }
      const res = await invitePost(s, 'Sam@Example.com')
      expect(res.status).toBe(201)
      const body = (await res.json()) as InviteBody
      expect(body.emailSent).toBe(false)
      expect(body.reason).toBe('daily_limit')
      expect(sent).toEqual([])
      expect(rowFor(s, SAM).last_sent_at).toBeNull()
      expect(MAX_INVITE_SENDS_PER_RECIPIENT).toBe(3)
    })

    it('still sends at one under the cap, and ignores older sends and other addresses', async () => {
      const sent = stubMail()
      const s = store()
      for (let i = 0; i < MAX_INVITE_SENDS_PER_RECIPIENT - 1; i += 1) {
        seed(s, { trip_id: `other-trip-${i}`, email: SAM, last_sent_at: RECENTLY() })
      }
      seed(s, { trip_id: 'other-trip-old', email: SAM, last_sent_at: LONG_AGO() })
      seed(s, { trip_id: 'other-trip-x', email: 'jo@example.com', last_sent_at: RECENTLY() })
      expect(((await (await invitePost(s, SAM)).json()) as InviteBody).emailSent).toBe(true)
      expect(sent).toHaveLength(1)
    })

    it('gives the same answer as the per-trip cap, so it reveals nothing about the recipient', async () => {
      stubMail()
      const byRecipient = store()
      for (let i = 0; i < MAX_INVITE_SENDS_PER_RECIPIENT; i += 1) {
        seed(byRecipient, { trip_id: `other-trip-${i}`, email: SAM, last_sent_at: RECENTLY() })
      }
      const byTrip = store()
      for (let i = 0; i < MAX_INVITE_SENDS_PER_TRIP; i += 1) seed(byTrip, { last_sent_at: RECENTLY() })

      const a = (await (await invitePost(byRecipient, SAM)).json()) as InviteBody
      const b = (await (await invitePost(byTrip, SAM)).json()) as InviteBody
      expect({ ...a, invite: null }).toEqual({ ...b, invite: null })
    })
  })

  describe('app-wide circuit breaker', () => {
    it(`stops all invite email after ${MAX_INVITE_SENDS_GLOBAL} sends app-wide in 24 hours`, async () => {
      const sent = stubMail()
      const s = store()
      for (let i = 0; i < MAX_INVITE_SENDS_GLOBAL; i += 1) {
        seed(s, { trip_id: `trip-${i}`, email: `person-${i}@example.com`, last_sent_at: RECENTLY() })
      }
      const res = await invitePost(s, SAM)
      expect(res.status).toBe(201)
      const body = (await res.json()) as InviteBody
      expect(body.emailSent).toBe(false)
      expect(body.reason).toBe('daily_limit')
      expect(sent).toEqual([])
      expect(MAX_INVITE_SENDS_GLOBAL).toBe(300)
    })

    it('still sends at one under the breaker', async () => {
      const sent = stubMail()
      const s = store()
      for (let i = 0; i < MAX_INVITE_SENDS_GLOBAL - 1; i += 1) {
        seed(s, { trip_id: `trip-${i}`, email: `person-${i}@example.com`, last_sent_at: RECENTLY() })
      }
      expect(((await (await invitePost(s, SAM)).json()) as InviteBody).emailSent).toBe(true)
      expect(sent).toHaveLength(1)
    })

    it.each([
      ['the claim (which holds every cap)', (sql: string) => sql.startsWith('UPDATE trip_invites SET last_sent_at = ?')],
      [
        'the re-read that names a refusal',
        (sql: string) => sql.includes('FROM trip_invites WHERE id = ? AND trip_id = ?'),
      ],
    ])('fails closed with 429 and sends nothing when %s cannot be read', async (_label, failing) => {
      const sent = stubMail()
      const errorLog = vi.spyOn(logger, 'error').mockImplementation(() => {})
      const s = store(failing)
      // A full per-trip cap makes the claim refuse, so the re-read runs too.
      for (let i = 0; i < MAX_INVITE_SENDS_PER_TRIP; i += 1) seed(s, { last_sent_at: RECENTLY() })
      const res = await invitePost(s, SAM)
      expect(res.status).toBe(429)
      expect(res.headers.get('Cache-Control')).toBe('private, no-store')
      expect(await res.json()).toEqual({ error: INVITES_UNAVAILABLE_MESSAGE })
      expect(sent).toEqual([])
      expect(errorLog).toHaveBeenCalledWith('invite send caps unreadable; not sending', expect.any(Error))
    })
  })

  describe('live-invite cap', () => {
    it(`refuses a new invite with 409 once the trip has ${MAX_LIVE_INVITES_PER_TRIP} live invites`, async () => {
      const sent = stubMail()
      const s = store()
      for (let i = 0; i < MAX_LIVE_INVITES_PER_TRIP; i += 1) seed(s, {})
      const res = await invitePost(s, SAM)
      expect(res.status).toBe(409)
      expect(await res.json()).toEqual({ error: LIVE_INVITE_LIMIT_MESSAGE })
      expect(s.invites.some((i) => i.email === SAM)).toBe(false)
      expect(sent).toEqual([])
      expect(MAX_LIVE_INVITES_PER_TRIP).toBe(50)
    })

    it('refuses bringing back a revoked invite at the cap, but not re-posting a live one', async () => {
      stubMail()
      const s = store()
      for (let i = 0; i < MAX_LIVE_INVITES_PER_TRIP - 1; i += 1) seed(s, {})
      seed(s, { email: 'live@example.com' })
      seed(s, { email: 'revoked@example.com', revoked_at: 1 })
      expect((await invitePost(s, 'revoked@example.com')).status).toBe(409)
      expect(rowFor(s, 'revoked@example.com').revoked_at).toBe(1)
      expect((await invitePost(s, 'live@example.com')).status).toBe(201)
    })

    it('counts accepted invites and ignores revoked ones and other trips', async () => {
      stubMail()
      const s = store()
      for (let i = 0; i < MAX_LIVE_INVITES_PER_TRIP - 1; i += 1) seed(s, { accepted_at: 5, accepted_user_id: `u-${i}` })
      seed(s, { revoked_at: 1 })
      seed(s, { trip_id: OTHER_TRIP_ID })
      expect((await invitePost(s, SAM)).status).toBe(201)
      expect((await invitePost(s, 'jo@example.com')).status).toBe(409)
    })
  })

  it('answers the same way whether or not the email has an account, and never looks one up', async () => {
    stubMail()
    const withAccount = store()
    withAccount.users.push({
      id: 'u-sam-0001',
      email: SAM,
      password_hash: 'unused',
      display_name: 'Sam',
      created_at: '2026-09-01T00:00:00.000Z',
      token_version: 0,
      email_verified: 1,
    })
    const without = store()

    const a = await invitePost(withAccount, SAM)
    const b = await invitePost(without, SAM)
    expect(a.status).toBe(b.status)
    const bodyA = (await a.json()) as InviteBody
    const bodyB = (await b.json()) as InviteBody
    expect({ ...bodyA, invite: { ...bodyA.invite, id: '', createdAt: 0 } }).toEqual({
      ...bodyB,
      invite: { ...bodyB.invite, id: '', createdAt: 0 },
    })
    for (const s of [withAccount, without]) {
      expect(s.fake.calls.some((c) => c.sql.includes('FROM users'))).toBe(false)
    }
  })

  describe('provider failure', () => {
    it('answers send_failed and gives the claim back when Brevo is unreachable', async () => {
      vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('brevo down'))))
      const errorLog = vi.spyOn(logger, 'error').mockImplementation(() => {})
      const warnLog = vi.spyOn(logger, 'warn').mockImplementation(() => {})
      const s = store()
      const res = await invitePost(s, SAM)
      expect(res.status).toBe(201)
      expect(await res.json()).toMatchObject({ emailSent: false, reason: 'send_failed' })
      expect(rowFor(s, SAM).last_sent_at).toBeNull()
      expect(errorLog).toHaveBeenCalledWith('email send threw', expect.any(Error))
      expect(warnLog).toHaveBeenCalledWith('invite email not sent', { inviteId: s.invites[0].id })
    })

    it('restores the previous send time when Brevo refuses, so a retry sends and the budget is not spent', async () => {
      const earlier = LONG_AGO()
      const s = store()
      seed(s, { email: SAM, last_sent_at: earlier })
      vi.spyOn(logger, 'error').mockImplementation(() => {})
      vi.spyOn(logger, 'warn').mockImplementation(() => {})
      vi.stubGlobal('fetch', vi.fn(async () => new Response('upstream error', { status: 502 })))

      // Outage: every attempt fails, and each gives its claim back.
      for (let i = 0; i < MAX_INVITE_SENDS_PER_RECIPIENT + 1; i += 1) {
        expect(await (await invitePost(s, SAM)).json()).toMatchObject({ emailSent: false, reason: 'send_failed' })
        expect(rowFor(s, SAM).last_sent_at).toBe(earlier)
      }

      // Provider back: the next attempt sends at once, not 24 hours later.
      const sent = stubMail()
      expect(await (await invitePost(s, SAM)).json()).toMatchObject({ emailSent: true })
      expect(sent).toHaveLength(1)
    })

    it('keeps the claim when mail is stubbed (no BREVO_API_KEY), since nothing failed', async () => {
      vi.spyOn(logger, 'info').mockImplementation(() => {})
      const s = inviteStore({ SITE_URL: MAIL.SITE_URL })
      const res = await invitePost(s, SAM)
      expect(await res.json()).toMatchObject({ emailSent: false, reason: 'send_failed' })
      expect(rowFor(s, SAM).last_sent_at).toEqual(expect.any(Number))
    })
  })

  it('does not mark an invite sent when preparing the email fails, so it can be retried at once', async () => {
    const sent = stubMail()
    const errorLog = vi.spyOn(logger, 'error').mockImplementation(() => {})
    const s = store((sql) => sql.includes('INSERT INTO trip_recap_links'))
    s.links.splice(0, s.links.length, ...s.links.filter((l) => l.trip_id !== TRIP_ID))

    const res = await invitePost(s, SAM)
    expect(res.status).toBe(500)
    expect(rowFor(s, SAM).last_sent_at).toBeNull()
    expect(sent).toEqual([])
    expect(errorLog).toHaveBeenCalledWith('invite create failed', expect.any(Error))
  })

  it.each([['not-an-email'], [''], [42], ['a'.repeat(250) + '@example.com']])(
    'rejects an invalid email %j with 400 and stores nothing',
    async (email) => {
      const sent = stubMail()
      const s = store()
      const res = await invitePost(s, email)
      expect(res.status).toBe(400)
      expect(await res.json()).toEqual({ error: 'Please enter a valid email address' })
      expect(s.invites).toEqual([])
      expect(sent).toEqual([])
    },
  )

  it('answers 404 for an unknown or malformed trip id', async () => {
    stubMail()
    const s = store()
    expect((await invitePost(s, SAM, UNKNOWN_TRIP_ID)).status).toBe(404)
    expect((await invitePost(s, SAM, 'not-a-uuid')).status).toBe(404)
    expect(s.invites).toEqual([])
  })

  it('refuses demo trips with 403', async () => {
    const sent = stubMail()
    const s = store()
    const res = await invitePost(s, SAM, DEMO_TRIP_IDS.dublin)
    expect(res.status).toBe(403)
    expect(s.invites).toEqual([])
    expect(sent).toEqual([])
  })

  it(`rate-limits invite writes past ${TRIP_INVITES_PER_HOUR} per hour per IP, POST and DELETE sharing one budget`, async () => {
    stubMail()
    const s = store()
    for (let i = 0; i < TRIP_INVITES_PER_HOUR - 1; i += 1) {
      expect((await invitePost(s, `guest${i}@example.com`)).status).toBe(201)
    }
    expect((await inviteDelete(s, s.invites[0].id)).status).toBe(200)
    const limitedPost = await invitePost(s, 'one-more@example.com')
    const limitedDelete = await inviteDelete(s, s.invites[1].id)
    expect(limitedPost.status).toBe(429)
    expect(limitedDelete.status).toBe(429)
    expect(s.invites.some((i) => i.email === 'one-more@example.com')).toBe(false)
    expect(s.invites[1].revoked_at).toBeNull()
    expect(TRIP_INVITES_PER_HOUR).toBe(30)
    expect(s.requestLog.every((r) => r.endpoint === 'trip-invites')).toBe(true)
  })
})

describe('GET /api/trips/:id/invites', () => {
  it('lists live invites oldest first, keeping accepted ones with acceptedAt, uncached', async () => {
    const s = store()
    const sam = seed(s, { email: SAM, created_at: 1 })
    const jo = seed(s, { email: 'jo@example.com', created_at: 2, accepted_at: 7, accepted_user_id: 'u-jo' })
    seed(s, { email: 'gone@example.com', created_at: 3, revoked_at: 4 })
    seed(s, { email: 'other@example.com', created_at: 0, trip_id: OTHER_TRIP_ID })

    const res = await inviteList(s)
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
    expect(await res.json()).toEqual({
      invites: [
        { id: sam.id, email: SAM, createdAt: 1, acceptedAt: null },
        { id: jo.id, email: 'jo@example.com', createdAt: 2, acceptedAt: 7 },
      ],
    })
  })

  it('answers 404 for an unknown trip and 403 for a demo trip', async () => {
    const s = store()
    expect((await inviteList(s, UNKNOWN_TRIP_ID)).status).toBe(404)
    expect((await inviteList(s, 'not-a-uuid')).status).toBe(404)
    expect((await inviteList(s, DEMO_TRIP_IDS.tokyo)).status).toBe(403)
  })
})

describe('DELETE /api/trips/:id/invites/:inviteId', () => {
  it('revokes a pending invite, which then drops out of the list; revoking again still succeeds', async () => {
    const s = store()
    const invite = seed(s, { email: SAM })
    const res = await inviteDelete(s, invite.id)
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
    expect(await res.json()).toEqual({ ok: true })
    const revokedAt = s.invites[0].revoked_at
    expect(revokedAt).toEqual(expect.any(Number))
    expect(await (await inviteList(s)).json()).toEqual({ invites: [] })

    expect((await inviteDelete(s, invite.id)).status).toBe(200)
    expect(s.invites[0].revoked_at).toBe(revokedAt)
  })

  it('does not revoke an accepted invite: keeps it listed, keeps the member, and says alreadyJoined', async () => {
    const s = store()
    const invite = seed(s, { email: SAM, accepted_at: 7, accepted_user_id: 'u-sam' })
    s.members.push({ trip_id: TRIP_ID, user_id: 'u-sam', role: 'contributor', created_at: 7 })

    const res = await inviteDelete(s, invite.id)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, alreadyJoined: true })
    expect(s.invites[0].revoked_at).toBeNull()
    expect(s.members).toEqual([{ trip_id: TRIP_ID, user_id: 'u-sam', role: 'contributor', created_at: 7 }])
    expect(await (await inviteList(s)).json()).toEqual({
      invites: [{ id: invite.id, email: SAM, createdAt: invite.created_at, acceptedAt: 7 }],
    })
  })

  it('answers 404 for an invite on another trip and leaves it live', async () => {
    const s = store()
    const invite = seed(s, { email: SAM, trip_id: OTHER_TRIP_ID })
    const res = await inviteDelete(s, invite.id, TRIP_ID)
    expect(res.status).toBe(404)
    expect(s.invites[0].revoked_at).toBeNull()
  })

  it('answers 404 for an accepted invite on another trip, without saying alreadyJoined', async () => {
    const s = store()
    const invite = seed(s, { email: SAM, trip_id: OTHER_TRIP_ID, accepted_at: 7, accepted_user_id: 'u-sam' })
    const res = await inviteDelete(s, invite.id, TRIP_ID)
    expect(res.status).toBe(404)
    expect(await res.json()).not.toHaveProperty('alreadyJoined')
  })

  it('answers 404 for an unknown or malformed invite id, and for an unknown trip', async () => {
    const s = store()
    expect((await inviteDelete(s, 'b7000000-0000-4000-8000-0000000000ff')).status).toBe(404)
    expect((await inviteDelete(s, 'not-a-uuid')).status).toBe(404)
    expect((await inviteDelete(s, 'b7000000-0000-4000-8000-0000000000ff', UNKNOWN_TRIP_ID)).status).toBe(404)
  })

  it('refuses demo trips with 403', async () => {
    const s = store()
    expect((await inviteDelete(s, 'b7000000-0000-4000-8000-0000000000ff', DEMO_TRIP_IDS.yellowstone)).status).toBe(403)
  })
})
