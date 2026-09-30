import { useEffect, useId, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { joinRecapTrip } from './joinApi'
import { CameraIcon, JoinTripSheet, type JoinStep } from './JoinTripSheet'

/** `?join=1`: back from the password login, run the join once signed in. */
export const JOIN_PARAM = 'join'
/** `?invite=1`: arrived from an invite email, open the sheet straight away. */
export const INVITE_PARAM = 'invite'

interface Props {
  /** The recap token from the URL. */
  token: string
  /** "the Anaheim, California trip": how the copy names this trip. */
  tripPhrase: string
  /**
   * Called once the viewer has joined and the recap should switch to
   * contributor mode. `addPhotosNow` is true when they asked to add photos
   * (the banner button, or step 3's "Add your photos"), false when they just
   * closed the sheet after joining.
   */
  onJoined: (addPhotosNow: boolean) => void
}

/**
 * "Were you on this trip? Add your photos" (design section 5), shown under
 * the public recap's header.
 *
 * "Add photos" joins straight away for a viewer signed in with a verified
 * email and hands the recap over to contributor mode (`onJoined`); anyone
 * else gets {@link JoinTripSheet} to prove an email first. `?invite=1` (the
 * invite email's link) presses the button on arrival, and `?join=1` (the
 * return from the password login) resumes the join once the session is
 * known. Both run once and are then removed from the URL, so a reload does
 * not repeat them. Neither joins an unverified account: the server would
 * refuse it, so step 1 opens with the account's email filled in instead.
 */
export function AddPhotosBanner({ token, tripPhrase, onJoined }: Props) {
  const { user, loading } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const [sheetStep, setSheetStep] = useState<JoinStep | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [fromInvite] = useState(() => searchParams.get(INVITE_PARAM) === '1')
  const autoRunRef = useRef(false)
  // Set when the sheet's join succeeded, so closing it still switches modes.
  const joinedInSheetRef = useRef(false)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const headingId = useId()

  /** Joins as the signed-in user; contributor mode on success, else the sheet or an error. */
  async function joinNow(): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      const result = await joinRecapTrip(token)
      if (result.kind === 'joined') onJoined(true)
      else if (result.kind === 'not-invited') setSheetStep('not-invited')
      else if (result.kind === 'signed-out') setSheetStep('email')
      else setError(result.message)
    } finally {
      setBusy(false)
    }
  }

  /** The banner button: join directly when the account can, else start the gate. */
  function onAddPhotos(): void {
    if (busy) return
    if (user?.emailVerified) void joinNow()
    else setSheetStep('email')
  }

  /** Closes the sheet; after a successful join the recap becomes a contributor's. */
  function closeSheet(): void {
    setSheetStep(null)
    if (joinedInSheetRef.current) onJoined(false)
  }

  // ?join=1 and ?invite=1 act once, after the session check settles.
  useEffect(() => {
    if (loading || autoRunRef.current) return
    const wantsJoin = searchParams.get(JOIN_PARAM) === '1'
    const wantsInvite = searchParams.get(INVITE_PARAM) === '1'
    if (!wantsJoin && !wantsInvite) return
    autoRunRef.current = true
    const next = new URLSearchParams(searchParams)
    next.delete(JOIN_PARAM)
    next.delete(INVITE_PARAM)
    setSearchParams(next, { replace: true })
    if (user?.emailVerified) void joinNow()
    else setSheetStep('email')
    // Keyed on the session settling only; the ref makes it one-shot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, user])

  return (
    <section className="chronicle-recap-join-banner" aria-labelledby={headingId}>
      <div className="chronicle-recap-join-banner-top">
        <span className="chronicle-recap-join-banner-icon" aria-hidden="true">
          <CameraIcon size={18} />
        </span>
        <h2 id={headingId} className="chronicle-recap-join-banner-title">
          Were you on this trip?
        </h2>
      </div>
      <p className="chronicle-recap-join-banner-text">Add your photos to this trip so everyone can see how it went.</p>
      <button
        ref={buttonRef}
        type="button"
        className="chronicle-recap-join-banner-btn"
        onClick={onAddPhotos}
        aria-disabled={busy || undefined}
      >
        <CameraIcon size={15} />
        {busy ? 'Adding you…' : 'Add photos'}
      </button>
      {error && (
        <p role="alert" className="chronicle-recap-join-banner-error">
          {error}
        </p>
      )}
      {sheetStep && (
        <JoinTripSheet
          token={token}
          tripPhrase={tripPhrase}
          fromInvite={fromInvite}
          initialStep={sheetStep}
          initialEmail={user?.email ?? ''}
          onClose={closeSheet}
          onJoined={() => {
            joinedInSheetRef.current = true
          }}
          onAddPhotos={() => {
            setSheetStep(null)
            onJoined(true)
          }}
          triggerRef={buttonRef}
        />
      )}
    </section>
  )
}
