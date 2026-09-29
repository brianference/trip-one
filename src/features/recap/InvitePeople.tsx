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

/** Where focus should land after the DOM settles from a send/remove/confirm/cancel transition. */
type PendingFocus = { kind: 'remove'; id: string } | { kind: 'email' } | { kind: 'joined'; id: string } | null

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
 * Which pending (removable) row should take focus after `removedId` is gone:
 * the row that will occupy its position once it's removed, or the previous
 * one when it was last. Only rows with a Remove button (not already joined)
 * are candidates — mirrors `StopPhotoStrip`'s post-removal focus rule.
 * @param invites - The list as it stood before the removal
 * @param joinedIds - Ids confirmed joined by a raced `alreadyJoined` response
 * @param removedId - The invite being removed
 * @returns The id to focus, or null when no pending row will remain
 */
function nextPendingFocusId(invites: TripInvite[], joinedIds: ReadonlySet<string>, removedId: string): string | null {
  const pendingIds = invites.filter((i) => i.acceptedAt === null && !joinedIds.has(i.id)).map((i) => i.id)
  const index = pendingIds.indexOf(removedId)
  const remaining = pendingIds.filter((id) => id !== removedId)
  if (remaining.length === 0) return null
  return remaining[index] ?? remaining[index - 1]
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
  // Ids a DELETE reported as `alreadyJoined`, kept separately from the invite
  // row itself: the server's real `acceptedAt` is the only true acceptance
  // time, and a client-side Date.now() stand-in must never be written into
  // (or rendered from) that field.
  const [joinedIds, setJoinedIds] = useState<ReadonlySet<string>>(new Set())
  // Refs, not state: a second press in the same tick still sees stale state.
  const sendingRef = useRef(false)
  const removingRef = useRef(false)

  const emailInputRef = useRef<HTMLInputElement>(null)
  const cancelButtonRef = useRef<HTMLButtonElement>(null)
  const removeButtonRefs = useRef<Map<string, HTMLButtonElement>>(new Map())
  const joinedBadgeRefs = useRef<Map<string, HTMLSpanElement>>(new Map())
  const pendingFocus = useRef<PendingFocus>(null)

  // Cancel is the only thing that should receive focus the moment the inline
  // confirm prompt opens for a row — keyed on confirmingId so it fires
  // exactly once per open, not on every render while it stays open.
  useEffect(() => {
    if (confirmingId != null) cancelButtonRef.current?.focus()
  }, [confirmingId])

  // Runs after every render (no dependency array) so it picks up a focus
  // request regardless of whether it was queued from a state update or an
  // event handler, and clears itself immediately so it fires once per request.
  useEffect(() => {
    const pending = pendingFocus.current
    if (!pending) return
    pendingFocus.current = null
    if (pending.kind === 'email') emailInputRef.current?.focus()
    else if (pending.kind === 'remove') removeButtonRefs.current.get(pending.id)?.focus()
    else joinedBadgeRefs.current.get(pending.id)?.focus()
  })

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

  /** Opens the inline confirm prompt for one pending invite. */
  function startConfirm(inviteId: string) {
    setConfirmingId(inviteId)
  }

  /** Closes the prompt without removing anything, returning focus to that row's Remove button. */
  function cancelConfirm(inviteId: string) {
    setConfirmingId(null)
    pendingFocus.current = { kind: 'remove', id: inviteId }
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
        // Raced with acceptance: the invite stays, its real acceptedAt comes
        // only from a later list refresh — joinedIds is a display-only flag,
        // never a stand-in for the timestamp itself.
        setJoinedIds((prev) => new Set(prev).add(inviteId))
        pendingFocus.current = { kind: 'joined', id: inviteId }
        setConfirmingId(null)
        setStatusMessage('That person already joined, so they were kept on the list instead of removed.')
      } else {
        const nextId = nextPendingFocusId(invites ?? [], joinedIds, inviteId)
        pendingFocus.current = nextId ? { kind: 'remove', id: nextId } : { kind: 'email' }
        setInvites((prev) => (prev ?? []).filter((i) => i.id !== inviteId))
        setConfirmingId(null)
        setStatusMessage('Invite removed.')
      }
    } catch (err) {
      logger.error('trip invite remove failed', err)
      setStatusMessage(err instanceof Error ? err.message : REMOVE_ERROR_FALLBACK)
      // Confirm stays open on error (not cleared here): the confirm/cancel
      // buttons remain mounted, so focus never falls to <body>, and the
      // press can be retried without reopening the prompt.
    } finally {
      removingRef.current = false
      setRemovingId(null)
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
            ref={emailInputRef}
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
            const joined = invite.acceptedAt !== null || joinedIds.has(invite.id)
            const confirming = confirmingId === invite.id
            const busy = removingId === invite.id
            const badgeRef = (el: HTMLSpanElement | null) => {
              if (el) joinedBadgeRefs.current.set(invite.id, el)
              else joinedBadgeRefs.current.delete(invite.id)
            }
            return (
              <li key={invite.id} className="chronicle-invite-row">
                <div className="chronicle-invite-row-main">
                  <span className="chronicle-invite-email">{invite.email}</span>
                  <span
                    ref={badgeRef}
                    // -1: not a normal Tab stop, but programmatically
                    // focusable — the target after an `alreadyJoined` remove.
                    tabIndex={-1}
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
                        ref={cancelButtonRef}
                        type="button"
                        className="chronicle-invite-row-confirm-no"
                        onClick={() => cancelConfirm(invite.id)}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    ref={(el) => {
                      if (el) removeButtonRefs.current.set(invite.id, el)
                      else removeButtonRefs.current.delete(invite.id)
                    }}
                    type="button"
                    className="chronicle-invite-remove-btn"
                    onClick={() => startConfirm(invite.id)}
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
