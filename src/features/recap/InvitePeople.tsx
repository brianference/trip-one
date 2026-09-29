import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { logger } from '../../lib/logger'
import {
  listTripInvites,
  revokeTripInvite,
  sendTripInvite,
  type InviteNotSentReason,
  type TripInvite,
} from './invitesApi'

/** Shown when the invite list can't be loaded and the server gave no usable message. */
const LOAD_ERROR_FALLBACK = 'We couldn’t load the invite list. Please try again in a moment.'
/** Shown when a send fails and the server gave no usable message. */
const SEND_ERROR_FALLBACK = 'We couldn’t send that invite. Please try again in a moment.'
/** Shown when a remove fails and the server gave no usable message. */
const REMOVE_ERROR_FALLBACK = 'We couldn’t remove that invite. Please try again in a moment.'

/**
 * The reader-facing reason an invite was saved but not emailed.
 * @param reason - The server's `reason` field
 */
function notSentReasonText(reason: InviteNotSentReason | undefined): string {
  if (reason === 'recently_sent') return 'they were emailed in the last 24 hours'
  if (reason === 'daily_limit') return "this person or trip hit today's invite limit, try again tomorrow"
  return 'the email could not be sent'
}

/** Replaces an invite with the same id, or appends it when it's not already in the list. */
function upsertInvite(invites: TripInvite[], invite: TripInvite): TripInvite[] {
  const index = invites.findIndex((existing) => existing.id === invite.id)
  if (index === -1) return [...invites, invite]
  const next = invites.slice()
  next[index] = invite
  return next
}

/**
 * The owner's "Invite people to add photos" panel, shown beside Share recap
 * on the owner's recap page (never on a demo trip, never on the public
 * route). Sends an email invite, lists everyone invited with their status,
 * and lets a pending invite be revoked. An accepted invite can't be removed
 * here — its member's access comes from the trip link they used to join, not
 * from the invite row — so its row shows a note instead of a Remove button.
 */
export function InvitePeople({ tripId }: { tripId: string }) {
  const emailInputId = useId()
  const [email, setEmail] = useState('')
  const [invites, setInvites] = useState<TripInvite[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [statusMessage, setStatusMessage] = useState('')
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [removingId, setRemovingId] = useState<string | null>(null)
  // Refs, not state: a second press in the same tick still sees stale state.
  const sendingRef = useRef(false)
  const removingRef = useRef(false)

  useEffect(() => {
    let cancelled = false
    listTripInvites(tripId)
      .then((loaded) => {
        if (!cancelled) setInvites(loaded)
      })
      .catch((err) => {
        logger.error('failed to load trip invites', err)
        if (cancelled) return
        setLoadError(err instanceof Error ? err.message : LOAD_ERROR_FALLBACK)
        setInvites([])
      })
    return () => {
      cancelled = true
    }
  }, [tripId])

  /** Sends the invite currently in the email field. */
  async function onSend(event: FormEvent) {
    event.preventDefault()
    if (sendingRef.current) return
    const trimmed = email.trim()
    if (!trimmed) return

    sendingRef.current = true
    setSending(true)
    setStatusMessage('')
    try {
      const result = await sendTripInvite(tripId, trimmed)
      setInvites((prev) => upsertInvite(prev ?? [], result.invite))
      setEmail('')
      setStatusMessage(
        result.emailSent
          ? `Invite sent to ${result.invite.email}.`
          : `Invite saved, but we didn’t send an email: ${notSentReasonText(result.reason)}.`,
      )
    } catch (err) {
      logger.error('trip invite send failed', err)
      setStatusMessage(err instanceof Error ? err.message : SEND_ERROR_FALLBACK)
    } finally {
      sendingRef.current = false
      setSending(false)
    }
  }

  /** Removes one pending invite after its inline confirm. */
  async function onRemove(inviteId: string) {
    if (removingRef.current) return
    removingRef.current = true
    setRemovingId(inviteId)
    setStatusMessage('')
    try {
      const result = await revokeTripInvite(tripId, inviteId)
      if (result.alreadyJoined) {
        // Raced with acceptance: the invite stays, now accepted.
        setInvites((prev) => (prev ?? []).map((i) => (i.id === inviteId ? { ...i, acceptedAt: Date.now() } : i)))
        setStatusMessage('That person already joined, so they were kept on the list instead of removed.')
      } else {
        setInvites((prev) => (prev ?? []).filter((i) => i.id !== inviteId))
        setStatusMessage('Invite removed.')
      }
    } catch (err) {
      logger.error('trip invite remove failed', err)
      setStatusMessage(err instanceof Error ? err.message : REMOVE_ERROR_FALLBACK)
    } finally {
      removingRef.current = false
      setRemovingId(null)
      setConfirmingId(null)
    }
  }

  return (
    <div className="chronicle-invite-card">
      <h2 className="chronicle-invite-title">Invite people to add photos</h2>
      <p className="chronicle-invite-explainer">
        They’ll get an email with a link to this recap. After signing in with that email, they can add their photos.
      </p>

      <form onSubmit={onSend} className="chronicle-invite-form">
        <label htmlFor={emailInputId} className="chronicle-invite-label">
          Email
        </label>
        <div className="chronicle-invite-form-row">
          <input
            id={emailInputId}
            type="email"
            required
            autoComplete="email"
            placeholder="friend@example.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="chronicle-invite-input"
          />
          <button
            type="submit"
            className="chronicle-invite-send-btn"
            // aria-disabled, not disabled: the button keeps focus while the
            // request is in flight, and onSend ignores presses meanwhile.
            aria-disabled={sending}
            aria-busy={sending || undefined}
          >
            {sending ? 'Sending…' : 'Send invite'}
          </button>
        </div>
      </form>

      <p role="status" className="chronicle-invite-status">
        {statusMessage}
      </p>

      {loadError && (
        <p role="alert" className="chronicle-recap-share-error">
          {loadError}
        </p>
      )}

      {invites && invites.length > 0 && (
        <ul className="chronicle-invite-list">
          {invites.map((invite) => {
            const joined = invite.acceptedAt !== null
            const confirming = confirmingId === invite.id
            const busy = removingId === invite.id
            return (
              <li key={invite.id} className="chronicle-invite-row">
                <div className="chronicle-invite-row-main">
                  <span className="chronicle-invite-email">{invite.email}</span>
                  <span
                    className={`chronicle-invite-badge${joined ? ' chronicle-invite-badge--joined' : ''}`}
                  >
                    {joined ? 'Joined — can’t be removed' : 'Invited'}
                  </span>
                </div>
                {joined ? (
                  <p className="chronicle-invite-joined-note">
                    They keep access to this trip through the link they used to join.
                  </p>
                ) : confirming ? (
                  <div className="chronicle-invite-row-confirm">
                    <span>Remove this invite?</span>
                    <div className="chronicle-invite-row-confirm-btns">
                      <button
                        type="button"
                        className="chronicle-invite-row-confirm-yes"
                        onClick={() => onRemove(invite.id)}
                        aria-disabled={busy}
                        aria-busy={busy || undefined}
                      >
                        Remove
                      </button>
                      <button
                        type="button"
                        className="chronicle-invite-row-confirm-no"
                        onClick={() => setConfirmingId(null)}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="chronicle-invite-remove-btn"
                    onClick={() => setConfirmingId(invite.id)}
                    aria-label={`Remove invite to ${invite.email}`}
                  >
                    Remove
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
