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

/** The inline confirm on a pending invite's row. */
export const REMOVE_INVITE_CONFIRM = 'Remove this invite?'
/** The inline confirm on a joined person's row: removing it takes their access away. */
export const REMOVE_ACCESS_CONFIRM = 'Remove access? They won’t be able to add photos anymore.'

/** Where focus should land after the DOM settles from a send/remove/confirm/cancel transition. */
type PendingFocus = { kind: 'remove'; id: string } | { kind: 'email' } | null

/**
 * The reader-facing reason an invite was saved but not emailed.
 * @param reason - The server's `reason` field
 */
function notSentReasonText(reason: InviteNotSentReason | undefined): string {
  if (reason === 'recently_sent') return 'they were emailed in the last 24 hours'
  if (reason === 'daily_limit') return "this person or trip hit today's invite limit, try again tomorrow"
  return 'the email could not be sent'
}

/**
 * Replaces an invite with the same id, or appends it when it's not already in the list.
 * @param invites - The current list
 * @param invite - The invite the server just returned
 */
function upsertInvite(invites: TripInvite[], invite: TripInvite): TripInvite[] {
  const index = invites.findIndex((existing) => existing.id === invite.id)
  if (index === -1) return [...invites, invite]
  const next = invites.slice()
  next[index] = invite
  return next
}

/**
 * Which row should take focus after `removedId` is gone: the row that will
 * occupy its position, or the previous one when it was last. Every row has a
 * Remove control, pending or joined. Mirrors `StopPhotoStrip`'s rule.
 * @param invites - The list as it stood before the removal
 * @param removedId - The invite being removed
 * @returns The id to focus, or null when no row will remain
 */
function nextFocusId(invites: TripInvite[], removedId: string): string | null {
  const ids = invites.map((i) => i.id)
  const index = ids.indexOf(removedId)
  const remaining = ids.filter((id) => id !== removedId)
  if (remaining.length === 0) return null
  return remaining[index] ?? remaining[index - 1]
}

/**
 * The owner's "Invite people to add photos" panel, shown beside Share recap
 * on the owner's recap page (never on a demo trip, never on the public
 * route). Sends an email invite and lists everyone invited: "Invited" while
 * pending, "Joined" once they joined from the recap. Every row can be
 * removed after an inline confirm: a pending invite is withdrawn, and a
 * joined person loses access (they can no longer add photos; photos they
 * already added stay). Successes are announced in a polite status line,
 * failures in an alert.
 */
export function InvitePeople({ tripId }: { tripId: string }) {
  const emailInputId = useId()
  const [email, setEmail] = useState('')
  const [invites, setInvites] = useState<TripInvite[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [statusMessage, setStatusMessage] = useState('')
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [removingId, setRemovingId] = useState<string | null>(null)
  // Refs, not state: a second press in the same tick still sees stale state.
  const sendingRef = useRef(false)
  const removingRef = useRef(false)

  const emailInputRef = useRef<HTMLInputElement>(null)
  const cancelButtonRef = useRef<HTMLButtonElement>(null)
  const removeButtonRefs = useRef<Map<string, HTMLButtonElement>>(new Map())
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
    else removeButtonRefs.current.get(pending.id)?.focus()
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
    setActionError(null)
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
      setActionError(err instanceof Error ? err.message : SEND_ERROR_FALLBACK)
    } finally {
      sendingRef.current = false
      setSending(false)
    }
  }

  /** Opens the inline confirm prompt for one row. */
  function startConfirm(inviteId: string) {
    setActionError(null)
    setConfirmingId(inviteId)
  }

  /** Closes the prompt without removing anything, returning focus to that row's Remove button. */
  function cancelConfirm(inviteId: string) {
    setConfirmingId(null)
    pendingFocus.current = { kind: 'remove', id: inviteId }
  }

  /** Removes one row after its inline confirm: withdraws a pending invite, or a joined person's access. */
  async function onRemove(inviteId: string) {
    if (removingRef.current) return
    removingRef.current = true
    setRemovingId(inviteId)
    setStatusMessage('')
    setActionError(null)
    try {
      const result = await revokeTripInvite(tripId, inviteId)
      const nextId = nextFocusId(invites ?? [], inviteId)
      pendingFocus.current = nextId ? { kind: 'remove', id: nextId } : { kind: 'email' }
      setInvites((prev) => (prev ?? []).filter((i) => i.id !== inviteId))
      setConfirmingId(null)
      setStatusMessage(result.removedMember ? 'Access removed.' : 'Invite removed.')
    } catch (err) {
      logger.error('trip invite remove failed', err)
      setActionError(err instanceof Error ? err.message : REMOVE_ERROR_FALLBACK)
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

      {actionError && (
        <p role="alert" className="chronicle-recap-share-error">
          {actionError}
        </p>
      )}

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
                  <span className={`chronicle-invite-badge${joined ? ' chronicle-invite-badge--joined' : ''}`}>
                    {joined ? 'Joined' : 'Invited'}
                  </span>
                </div>
                {confirming ? (
                  <div className="chronicle-invite-row-confirm">
                    <span>{joined ? REMOVE_ACCESS_CONFIRM : REMOVE_INVITE_CONFIRM}</span>
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
                    aria-label={joined ? `Remove access for ${invite.email}` : `Remove invite to ${invite.email}`}
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
