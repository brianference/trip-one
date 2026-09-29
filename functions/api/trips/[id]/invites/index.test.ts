// @vitest-environment node
import { describe, it, expect, vi, afterEach } from 'vitest'
import { onRequestGet, onRequestPost } from './index'
import { onRequestDelete } from './[inviteId]'
import { TRIP_INVITES_PER_HOUR } from '../../../../lib/tripInvites'
import { inviteStore, TRIP_ID, OTHER_TRIP_ID, ACTIVE_TOKEN, type InviteStore } from '../../../../lib/testInvites'
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
const SUBJECT_SUFFIX = ": you're invited to add your photos"

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

/** A store with mail configured. */
function store(): InviteStore {
  return inviteStore(MAIL)
}

function ctx(s: InviteStore, tripId: string, init: RequestInit = {}, ip = '203.0.113.30') {
  const headers = { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip }
  return {
    env: s.fake.env,
    request: new Request(`https://trip-one.pages.dev/api/trips/${tripId}/invites`, { ...init, headers }),
    params: { id: tripId },
  }
}

function invitePost(s: InviteStore, email: unknown, tripId = TRIP_ID, ip?: string): Promise<Response> {
  return onRequestPost(ctx(s, tripId, { method: 'POST', body: JSON.stringify({ email }) }, ip))
}

function inviteList(s: InviteStore, tripId = TRIP_ID): Promise<Response> {
  return onRequestGet(ctx(s, tripId))
}

function inviteDelete(s: InviteStore, inviteId: string, tripId = TRIP_ID, ip?: string): Promise<Response> {
  const base = ctx(s, tripId, { method: 'DELETE' }, ip)
  return onRequestDelete({ ...base, params: { id: tripId, inviteId } })
}

type InviteBody = { invite: { id: string; email: string; createdAt: number; acceptedAt: number | null } }

describe('POST /api/trips/:id/invites', () => {
  it('stores the normalized email, emails a recap invite link and returns the invite, uncached', async () => {
    const sent = stubMail()
    const s = store()
    const res = await invitePost(s, '  Sam@Example.COM ')

    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
    const body = (await res.json()) as InviteBody
    expect(body).toEqual({
      invite: { id: s.invites[0].id, email: 'sam@example.com', createdAt: s.invites[0].created_at, acceptedAt: null },
    })
    expect(s.invites).toHaveLength(1)
    expect(s.invites[0]).toMatchObject({ trip_id: TRIP_ID, email: 'sam@example.com', revoked_at: null })

    expect(sent).toHaveLength(1)
    expect(sent[0].to).toBe('sam@example.com')
    expect(sent[0].subject).toBe(`Dublin weekend${SUBJECT_SUFFIX}`)
    // The link is the existing active recap, never the trip itself.
    expect(sent[0].html).toContain(`https://trip-one.pages.dev/recap/${ACTIVE_TOKEN}?invite=1`)
    expect(sent[0].text).toContain(`https://trip-one.pages.dev/recap/${ACTIVE_TOKEN}?invite=1`)
    for (const part of [sent[0].html, sent[0].subject]) expect(part.toLowerCase()).not.toContain(TRIP_ID)
  })

  it('creates a recap link when the trip has none active, and reuses it for the next invite', async () => {
    const sent = stubMail()
    const s = store()
    s.links.splice(0, s.links.length, ...s.links.filter((l) => l.trip_id !== TRIP_ID))

    await invitePost(s, 'sam@example.com')
    const active = s.links.filter((l) => l.trip_id === TRIP_ID && l.revoked_at === null)
    expect(active).toHaveLength(1)
    expect(active[0].token).toHaveLength(RECAP_TOKEN_LENGTH)
    expect(sent[0].html).toContain(`/recap/${active[0].token}?invite=1`)

    await invitePost(s, 'jo@example.com')
    expect(s.links.filter((l) => l.trip_id === TRIP_ID)).toHaveLength(1)
    expect(sent[1].html).toContain(`/recap/${active[0].token}?invite=1`)
  })

  it('re-inviting a revoked email un-revokes the same invite instead of adding a second', async () => {
    stubMail()
    const s = store()
    const first = (await (await invitePost(s, 'sam@example.com')).json()) as InviteBody
    expect((await inviteDelete(s, first.invite.id)).status).toBe(200)
    expect(s.invites[0].revoked_at).not.toBeNull()

    const again = (await (await invitePost(s, 'SAM@example.com')).json()) as InviteBody
    expect(again.invite.id).toBe(first.invite.id)
    expect(s.invites).toHaveLength(1)
    expect(s.invites[0].revoked_at).toBeNull()
  })

  it('escapes the trip name in the email and keeps newlines out of the subject', async () => {
    const sent = stubMail()
    const s = store()
    s.trips[TRIP_ID].title = '<img src=x onerror=alert(1)> Tom & "Jo"\r\nBcc: attacker@example.com'
    await invitePost(s, 'sam@example.com')

    expect(sent[0].html).not.toContain('<img src=x')
    expect(sent[0].html).toContain('&lt;img src=x onerror=alert(1)&gt; Tom &amp; &quot;Jo&quot;')
    expect(sent[0].subject).not.toMatch(/[\r\n]/)
    expect(sent[0].subject).toBe(
      `<img src=x onerror=alert(1)> Tom & "Jo" Bcc: attacker@example.com${SUBJECT_SUFFIX}`,
    )
  })

  it('strips the trip id from a title that contains the trip link', async () => {
    const sent = stubMail()
    const s = store()
    s.trips[TRIP_ID].title = `Lisbon https://trip-one.pages.dev/trip/${TRIP_ID.toUpperCase()}`
    await invitePost(s, 'sam@example.com')
    for (const part of [sent[0].html, sent[0].text, sent[0].subject]) {
      expect(part.toLowerCase()).not.toContain(TRIP_ID.toLowerCase())
    }
  })

  it('names an untitled trip after its place', async () => {
    const sent = stubMail()
    const s = store()
    s.trips[TRIP_ID].title = null
    await invitePost(s, 'sam@example.com')
    expect(sent[0].subject).toBe(`Dublin, Ireland${SUBJECT_SUFFIX}`)
  })

  it('answers the same way whether or not the email has an account, and never looks one up', async () => {
    stubMail()
    const withAccount = store()
    withAccount.users.push({
      id: 'u-sam-0001',
      email: 'sam@example.com',
      password_hash: 'unused',
      display_name: 'Sam',
      created_at: '2026-09-01T00:00:00.000Z',
      token_version: 0,
      email_verified: 1,
    })
    const without = store()

    const a = await invitePost(withAccount, 'sam@example.com')
    const b = await invitePost(without, 'sam@example.com')
    expect(a.status).toBe(b.status)
    const bodyA = (await a.json()) as InviteBody
    const bodyB = (await b.json()) as InviteBody
    expect(Object.keys(bodyA.invite)).toEqual(Object.keys(bodyB.invite))
    expect({ ...bodyA.invite, id: '', createdAt: 0 }).toEqual({ ...bodyB.invite, id: '', createdAt: 0 })
    for (const s of [withAccount, without]) {
      expect(s.fake.calls.some((c) => c.sql.includes('FROM users'))).toBe(false)
    }
  })

  it('still answers 200 when the email cannot be sent', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('brevo down'))))
    const errorLog = vi.spyOn(logger, 'error').mockImplementation(() => {})
    const warnLog = vi.spyOn(logger, 'warn').mockImplementation(() => {})
    const s = store()
    const res = await invitePost(s, 'sam@example.com')
    expect(res.status).toBe(200)
    expect(s.invites).toHaveLength(1)
    expect(errorLog).toHaveBeenCalledWith('email send threw', expect.any(Error))
    expect(warnLog).toHaveBeenCalledWith('invite email not sent', { inviteId: s.invites[0].id })
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
    expect((await invitePost(s, 'sam@example.com', UNKNOWN_TRIP_ID)).status).toBe(404)
    expect((await invitePost(s, 'sam@example.com', 'not-a-uuid')).status).toBe(404)
    expect(s.invites).toEqual([])
  })

  it('refuses demo trips with 403', async () => {
    const sent = stubMail()
    const s = store()
    const res = await invitePost(s, 'sam@example.com', DEMO_TRIP_IDS.dublin)
    expect(res.status).toBe(403)
    expect(s.invites).toEqual([])
    expect(sent).toEqual([])
  })

  it(`rate-limits invite writes past ${TRIP_INVITES_PER_HOUR} per hour per IP, POST and DELETE sharing one budget`, async () => {
    const sent = stubMail()
    const s = store()
    for (let i = 0; i < TRIP_INVITES_PER_HOUR - 1; i += 1) {
      expect((await invitePost(s, `guest${i}@example.com`)).status).toBe(200)
    }
    expect((await inviteDelete(s, s.invites[0].id)).status).toBe(200)
    const limitedPost = await invitePost(s, 'one-more@example.com')
    const limitedDelete = await inviteDelete(s, s.invites[1].id)
    expect(limitedPost.status).toBe(429)
    expect(limitedDelete.status).toBe(429)
    expect(s.invites.some((i) => i.email === 'one-more@example.com')).toBe(false)
    expect(s.invites[1].revoked_at).toBeNull()
    expect(sent).toHaveLength(TRIP_INVITES_PER_HOUR - 1)
    expect(TRIP_INVITES_PER_HOUR).toBe(30)
    expect(s.requestLog.every((r) => r.endpoint === 'trip-invites')).toBe(true)
  })
})

describe('GET /api/trips/:id/invites', () => {
  it('lists the trip’s live invites oldest first, without revoked ones or other trips’, uncached', async () => {
    stubMail()
    const s = store()
    await invitePost(s, 'sam@example.com')
    await invitePost(s, 'jo@example.com')
    await invitePost(s, 'gone@example.com')
    await invitePost(s, 'other@example.com', OTHER_TRIP_ID)
    s.invites[0].created_at = 1
    s.invites[1].created_at = 2
    await inviteDelete(s, s.invites[2].id)

    const res = await inviteList(s)
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
    expect(await res.json()).toEqual({
      invites: [
        { id: s.invites[0].id, email: 'sam@example.com', createdAt: 1, acceptedAt: null },
        { id: s.invites[1].id, email: 'jo@example.com', createdAt: 2, acceptedAt: null },
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
  it('revokes the invite, which then drops out of the list; revoking again still succeeds', async () => {
    stubMail()
    const s = store()
    const { invite } = (await (await invitePost(s, 'sam@example.com')).json()) as InviteBody
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

  it('answers 404 for an invite on another trip and leaves it live', async () => {
    stubMail()
    const s = store()
    const { invite } = (await (await invitePost(s, 'sam@example.com', OTHER_TRIP_ID)).json()) as InviteBody
    const res = await inviteDelete(s, invite.id, TRIP_ID)
    expect(res.status).toBe(404)
    expect(s.invites[0].revoked_at).toBeNull()
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
