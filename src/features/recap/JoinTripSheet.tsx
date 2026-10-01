import {
  useEffect,
  useId,
  useRef,
  useState,
  type ClipboardEvent,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type RefObject,
} from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { logger } from '../../lib/logger'
import { joinRecapTrip, maskEmail } from './joinApi'

/** How many digits a sign-in code has (the server's `codeVerifySchema`). */
export const CODE_LENGTH = 6

/** Seconds before "Resend code" works again after a code was sent. */
export const RESEND_COOLDOWN_SECONDS = 30

const ONE_SECOND_MS = 1000

/** Elements the focus trap cycles Tab/Shift+Tab between. */
const FOCUSABLE_SELECTOR = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'

/** Loose shape check before asking the server; the server's Zod schema is the real validator. */
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const EMAIL_INVALID_MESSAGE = 'Enter the email address the trip owner invited.'
const CODE_INCOMPLETE_MESSAGE = `Enter all ${CODE_LENGTH} digits of the code.`

/** Shown under the resend link once a code has been re-sent at least once. */
export const RESEND_HINT = 'Still nothing? Check spam, or try again in an hour.'

/** Which screen of the sheet is showing. */
export type JoinStep = 'email' | 'code' | 'joined' | 'not-invited'

/** How step 1 was left: "Continue" and "Create an account" send the same code, only the copy differs. */
type EmailMode = 'sign-in' | 'create'

interface Props {
  /** The recap token from the URL; join and the password-login return path both use it. */
  token: string
  /** "the Anaheim, California trip": how the sheet's copy names this trip. */
  tripPhrase: string
  /** True when the viewer arrived from an invite email (`?invite=1`): shows the "invited this email" note. */
  fromInvite: boolean
  /** The screen to open on (the banner opens `not-invited` after a signed-in 403). */
  initialStep: JoinStep
  /** Prefills step 1 (a signed-in but unverified viewer's own address). */
  initialEmail: string
  /** Called to close the sheet: Escape, a scrim tap or the close button. */
  onClose: () => void
  /** Called once the join succeeds (step 3 shows); the recap is a contributor's from then on. */
  onJoined: () => void
  /** Step 3's "Add your photos": the parent closes the sheet and starts adding photos on the recap. */
  onAddPhotos: () => void
  /** The banner button that opened the sheet; focus returns there on close. */
  triggerRef: RefObject<HTMLButtonElement>
}

/**
 * Reads an error thrown by the auth helpers as text a person can act on.
 * @param err - Whatever was thrown
 * @param fallback - Used when the error carries no message
 */
function errorText(err: unknown, fallback: string): string {
  return err instanceof Error && err.message !== '' ? err.message : fallback
}

/** The three progress dots under the grab handle; `current` is 1-based. */
function StepDots({ current }: { current: number }) {
  return (
    <div className="chronicle-join-dots" aria-hidden="true">
      {[1, 2, 3].map((n) => (
        <span
          key={n}
          className={`chronicle-join-dot${n === current ? ' chronicle-join-dot--active' : n < current ? ' chronicle-join-dot--done' : ''}`}
        />
      ))}
    </div>
  )
}

/** Envelope icon (design section 6). */
function MailIcon() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m4 7 8 6 8-6" />
    </svg>
  )
}

/** Camera icon used on the photo-accent buttons (design sections 5 and 8). */
export function CameraIcon({ size }: { size: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 8h3l2-2h6l2 2h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z" />
      <circle cx="12" cy="13" r="3.5" />
    </svg>
  )
}

/**
 * Six single-digit boxes for the emailed code. Typing a digit moves to the
 * next box, Backspace on an empty box clears and returns to the previous one,
 * and pasting (or an OS autofill of) the whole code fills every box.
 */
function CodeBoxes({
  digits,
  onChange,
  firstRef,
  labelId,
  invalid,
}: {
  digits: string[]
  onChange: (next: string[]) => void
  firstRef: RefObject<HTMLInputElement>
  labelId: string
  invalid: boolean
}) {
  const boxRefs = useRef<(HTMLInputElement | null)[]>([])

  /** Focuses box `index` (clamped to the row). */
  function focusBox(index: number): void {
    const clamped = Math.max(0, Math.min(CODE_LENGTH - 1, index))
    boxRefs.current[clamped]?.focus()
  }

  /**
   * Writes `text`'s digits into the boxes starting at `start`, then focuses
   * the box after the last one written.
   */
  function fillFrom(start: number, text: string): void {
    const incoming = text.replace(/\D/g, '').slice(0, CODE_LENGTH - start)
    if (incoming === '') return
    const next = [...digits]
    for (let i = 0; i < incoming.length; i++) next[start + i] = incoming[i]
    onChange(next)
    focusBox(start + incoming.length)
  }

  /** A change in box `index`: one digit advances, several (autofill) spread across the row. */
  function onInput(index: number, value: string): void {
    const onlyDigits = value.replace(/\D/g, '')
    if (onlyDigits === '') {
      const next = [...digits]
      next[index] = ''
      onChange(next)
      return
    }
    if (onlyDigits.length > 1) {
      // A full code typed or autofilled into one box fills the row from the start.
      fillFrom(onlyDigits.length >= CODE_LENGTH ? 0 : index, onlyDigits)
      return
    }
    fillFrom(index, onlyDigits)
  }

  /** Backspace on an empty box steps back; arrows move between boxes. */
  function onKeyDown(index: number, event: ReactKeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'Backspace' && digits[index] === '' && index > 0) {
      event.preventDefault()
      const next = [...digits]
      next[index - 1] = ''
      onChange(next)
      focusBox(index - 1)
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault()
      focusBox(index - 1)
    } else if (event.key === 'ArrowRight') {
      event.preventDefault()
      focusBox(index + 1)
    }
  }

  /** A pasted code fills the row from the first box, whichever box had focus. */
  function onPaste(index: number, event: ClipboardEvent<HTMLInputElement>): void {
    const text = event.clipboardData.getData('text')
    const onlyDigits = text.replace(/\D/g, '')
    if (onlyDigits === '') return
    event.preventDefault()
    fillFrom(onlyDigits.length >= CODE_LENGTH ? 0 : index, onlyDigits)
  }

  return (
    <div className="chronicle-join-code-row" role="group" aria-labelledby={labelId}>
      {digits.map((digit, index) => (
        <input
          key={index}
          ref={(el) => {
            boxRefs.current[index] = el
            if (index === 0) (firstRef as { current: HTMLInputElement | null }).current = el
          }}
          className={`chronicle-join-code-box${digit !== '' ? ' chronicle-join-code-box--filled' : ''}`}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete={index === 0 ? 'one-time-code' : 'off'}
          maxLength={index === 0 ? CODE_LENGTH : 1}
          aria-label={`Digit ${index + 1} of ${CODE_LENGTH}`}
          aria-invalid={invalid || undefined}
          value={digit}
          onChange={(e) => onInput(index, e.target.value)}
          onKeyDown={(e) => onKeyDown(index, e)}
          onPaste={(e) => onPaste(index, e)}
          onFocus={(e) => e.target.select()}
        />
      ))}
    </div>
  )
}

/**
 * The "Were you on this trip?" gate (design sections 6-8), a bottom sheet
 * opened from the public recap's banner:
 *
 * 1. Sign in or create an account: an email, then "Continue" or "Create an
 *    account" (both email a code; the code creates the account if there is
 *    none), or "Sign in with a password instead" (the login page, which
 *    returns here with `?join=1`).
 * 2. Check your email: the six-digit code, with a rate-kept resend.
 * 3. You're on this trip: the join succeeded; "Add your photos" closes the
 *    sheet and leaves the viewer on the recap as a contributor.
 *
 * A signed-in email that is not invited gets the fixed refusal with a way to
 * sign out and try another address. Joining never returns or links to the
 * trip itself: contributors only add and remove their own photos here.
 *
 * An accessible modal dialog: traps Tab focus, closes on Escape or a scrim
 * tap, moves focus to each step's first field (or heading) as the step
 * changes, and returns focus to the banner button on close.
 */
export function JoinTripSheet({
  token,
  tripPhrase,
  fromInvite,
  initialStep,
  initialEmail,
  onClose,
  onJoined,
  onAddPhotos,
  triggerRef,
}: Props) {
  const { requestCode, verifyCode, logout, user } = useAuth()
  const navigate = useNavigate()
  const [step, setStep] = useState<JoinStep>(initialStep)
  const [mode, setMode] = useState<EmailMode>('sign-in')
  const [email, setEmail] = useState(initialEmail)
  const [digits, setDigits] = useState<string[]>(() => Array<string>(CODE_LENGTH).fill(''))
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const [cooldown, setCooldown] = useState(0)
  /** How many times "Resend code" sent a new code; after the first, the spam hint shows. */
  const [resends, setResends] = useState(0)
  /** Set once the code verified: a retry after a failed join must not spend the (one-time) code again. */
  const [verified, setVerified] = useState(false)
  // A ref, not the `busy` state: two presses in the same tick both see the
  // stale state and would send two codes or spend the code twice.
  const inFlightRef = useRef(false)

  const dialogRef = useRef<HTMLDivElement>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const emailRef = useRef<HTMLInputElement>(null)
  const firstCodeRef = useRef<HTMLInputElement>(null)
  const headingId = useId()
  const emailId = useId()
  const codeLabelId = useId()

  // Focus trap, Escape and scroll lock: mounted once for the sheet's lifetime.
  useEffect(() => {
    /** Every enabled focusable element inside the sheet. */
    function focusableElements(): HTMLElement[] {
      const dialog = dialogRef.current
      if (!dialog) return []
      return Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter((el) => !el.hasAttribute('disabled'))
    }
    /** Escape closes; Tab and Shift+Tab wrap inside the sheet. */
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }
      if (event.key !== 'Tab') return
      const elements = focusableElements()
      if (elements.length === 0) return
      const first = elements[0]
      const last = elements[elements.length - 1]
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const trigger = triggerRef.current
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = prevOverflow
      trigger?.focus()
    }
    // Once per mount: re-running would reset the trap and steal focus mid-typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Each step change moves focus to where the person acts next.
  useEffect(() => {
    if (step === 'email') emailRef.current?.focus()
    else if (step === 'code') firstCodeRef.current?.focus()
    else headingRef.current?.focus()
  }, [step])

  // The resend cooldown ticks down once a second while it is running.
  useEffect(() => {
    if (cooldown <= 0) return
    const timer = setTimeout(() => setCooldown((s) => s - 1), ONE_SECOND_MS)
    return () => clearTimeout(timer)
  }, [cooldown])

  /**
   * Marks a request as running, unless one already is.
   * @returns False when another request is still in flight
   */
  function startRequest(): boolean {
    if (inFlightRef.current) return false
    inFlightRef.current = true
    setBusy(true)
    return true
  }

  /** Marks the running request as finished. */
  function endRequest(): void {
    inFlightRef.current = false
    setBusy(false)
  }

  /** Step 1: send a code to the typed address, then show step 2. */
  async function sendCode(nextMode: EmailMode): Promise<void> {
    if (inFlightRef.current) return
    setError(null)
    if (!EMAIL_SHAPE.test(email.trim())) {
      setError(EMAIL_INVALID_MESSAGE)
      emailRef.current?.focus()
      return
    }
    if (!startRequest()) return
    try {
      await requestCode(email.trim())
      setMode(nextMode)
      setDigits(Array<string>(CODE_LENGTH).fill(''))
      setStatus('')
      setResends(0)
      setCooldown(RESEND_COOLDOWN_SECONDS)
      setStep('code')
    } catch (err) {
      setError(errorText(err, 'Could not send a code. Please try again.'))
    } finally {
      endRequest()
    }
  }

  /** Step 2: a fresh code, allowed once the cooldown has run out. */
  async function resend(): Promise<void> {
    if (cooldown > 0 || !startRequest()) return
    setError(null)
    try {
      await requestCode(email.trim())
      setDigits(Array<string>(CODE_LENGTH).fill(''))
      setCooldown(RESEND_COOLDOWN_SECONDS)
      setResends((count) => count + 1)
      setStatus(`We sent a new code to ${maskEmail(email)}.`)
      firstCodeRef.current?.focus()
    } catch (err) {
      setError(errorText(err, 'Could not send a code. Please try again.'))
    } finally {
      endRequest()
    }
  }

  /** Runs the join; a 200 is the only path to step 3. */
  async function join(): Promise<void> {
    const result = await joinRecapTrip(token)
    if (result.kind === 'joined') {
      setStep('joined')
      onJoined()
    } else if (result.kind === 'not-invited') {
      setStep('not-invited')
    } else if (result.kind === 'signed-out') {
      // The session the code created is gone and the code is spent, so the
      // next Verify must run a fresh code through verify, not skip to join.
      setVerified(false)
      setDigits(Array<string>(CODE_LENGTH).fill(''))
      setError('Your sign-in didn’t stick. Please request a new code.')
    } else {
      setError(result.message)
    }
  }

  /** Step 2: verify the code (which signs in), then join. */
  async function onVerify(event: FormEvent): Promise<void> {
    event.preventDefault()
    if (inFlightRef.current) return
    setError(null)
    const code = digits.join('')
    if (!verified && code.length !== CODE_LENGTH) {
      setError(CODE_INCOMPLETE_MESSAGE)
      firstCodeRef.current?.focus()
      return
    }
    if (!startRequest()) return
    if (!verified) {
      try {
        await verifyCode(email.trim(), code)
        setVerified(true)
      } catch (err) {
        setError(errorText(err, "That code didn't work. Check it or request a new one."))
        endRequest()
        firstCodeRef.current?.focus()
        return
      }
    }
    try {
      await join()
    } finally {
      endRequest()
    }
  }

  /** The refusal's way out: sign out and start again with another address. */
  async function switchEmail(): Promise<void> {
    if (!startRequest()) return
    try {
      await logout()
    } catch (err) {
      // logout clears the session locally even when its request fails, so
      // starting over with another address is still right.
      logger.warn('sign-out request failed', { error: err instanceof Error ? err.message : String(err) })
    } finally {
      endRequest()
      setEmail('')
      setError(null)
      setVerified(false)
      setStep('email')
    }
  }

  /** Hands off to the password login, which returns here and resumes the join. */
  function signInWithPassword(): void {
    onClose()
    navigate('/login', { state: { from: `/recap/${token}?join=1` } })
  }

  // The signed-in address when there is one: it is the email the join was
  // checked against, so it is the one to confirm or to ask the owner to invite.
  const accountEmail = user?.email ?? email.trim()
  const alert = error ? (
    <p role="alert" className="chronicle-join-error">
      {error}
    </p>
  ) : null

  const sheet = (
    <div className="chronicle-join-scrim" onClick={onClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        className="chronicle-join-sheet"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="chronicle-join-grab" aria-hidden="true" />
        <button type="button" className="chronicle-join-close" onClick={onClose} aria-label="Close">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        </button>

        {step === 'email' && (
          <form noValidate onSubmit={(e) => { e.preventDefault(); void sendCode('sign-in') }}>
            <StepDots current={1} />
            {fromInvite && (
              <p className="chronicle-join-note">
                <MailIcon />
                <span>The owner of {tripPhrase} invited this email to add photos.</span>
              </p>
            )}
            <h2 id={headingId} ref={headingRef} tabIndex={-1} className="chronicle-join-title">
              Sign in or create an account
            </h2>
            <p className="chronicle-join-sub">Verify it’s you before adding photos to this trip.</p>
            <div className="chronicle-join-field">
              <label htmlFor={emailId} className="chronicle-join-label">
                Email
              </label>
              <div className="chronicle-join-input-box">
                <MailIcon />
                <input
                  ref={emailRef}
                  id={emailId}
                  type="email"
                  name="email"
                  autoComplete="email"
                  inputMode="email"
                  placeholder="you@example.com"
                  className="chronicle-join-input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  aria-invalid={error ? true : undefined}
                />
              </div>
            </div>
            {alert}
            <button type="submit" className="chronicle-join-primary" disabled={busy}>
              {busy ? 'Sending…' : 'Continue'}
            </button>
            <button type="button" className="chronicle-join-outline" disabled={busy} onClick={() => void sendCode('create')}>
              Create an account
            </button>
            <button type="button" className="chronicle-join-link" onClick={signInWithPassword}>
              Sign in with a password instead
            </button>
          </form>
        )}

        {step === 'code' && (
          <form noValidate onSubmit={(e) => void onVerify(e)}>
            <StepDots current={2} />
            <h2 id={headingId} ref={headingRef} tabIndex={-1} className="chronicle-join-title">
              Check your email
            </h2>
            <p id={codeLabelId} className="chronicle-join-sub">
              We sent a code to {maskEmail(email)}
              {mode === 'create' && (
                <>
                  <br />
                  Entering it creates your Trip One account if you don’t have one yet.
                </>
              )}
            </p>
            <CodeBoxes digits={digits} onChange={setDigits} firstRef={firstCodeRef} labelId={codeLabelId} invalid={Boolean(error)} />
            {alert}
            <p className="chronicle-visually-hidden" role="status">
              {status}
            </p>
            <button type="submit" className="chronicle-join-primary" disabled={busy}>
              {busy ? 'Verifying…' : 'Verify code'}
            </button>
            <button type="button" className="chronicle-join-link" disabled={busy || cooldown > 0} onClick={() => void resend()}>
              {cooldown > 0 ? `Didn’t get it? Resend code in ${cooldown}s` : 'Didn’t get it? Resend code'}
            </button>
            {resends > 0 && <p className="chronicle-join-hint">{RESEND_HINT}</p>}
          </form>
        )}

        {step === 'joined' && (
          <div>
            <StepDots current={3} />
            <div className="chronicle-join-check" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6 9 17l-5-5" />
              </svg>
            </div>
            <h2 id={headingId} ref={headingRef} tabIndex={-1} className="chronicle-join-title">
              You’re on this trip
            </h2>
            <p className="chronicle-join-body">
              {maskEmail(accountEmail)} is confirmed on {tripPhrase}. The owner added this email, so you can add your own
              photos now.
            </p>
            <button type="button" className="chronicle-join-photo-btn" onClick={onAddPhotos}>
              <CameraIcon size={15} />
              Add your photos
            </button>
          </div>
        )}

        {step === 'not-invited' && (
          <div>
            <StepDots current={2} />
            <h2 id={headingId} ref={headingRef} tabIndex={-1} className="chronicle-join-title">
              Use the invited email
            </h2>
            <p role="alert" className="chronicle-join-body">
              This email isn't invited to this trip. Ask the trip owner to invite {accountEmail}.
            </p>
            <button type="button" className="chronicle-join-outline" disabled={busy} onClick={() => void switchEmail()}>
              Use a different email
            </button>
          </div>
        )}
      </div>
    </div>
  )

  return createPortal(sheet, document.body)
}
