import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Seo } from '../../components/Seo'
import { PageShell } from '../../components/layout/PageShell'
import { Button, ButtonLink } from '../../components/ui/Button'
import { logger } from '../../lib/logger'
import { useAuth } from './AuthContext'

/**
 * `needs-sign-in`: the link is good, but it was opened without that
 * account's own session, so nothing was confirmed and the link is unspent.
 * `denied`: the visitor said "This wasn't me" and the account was locked.
 */
type Status = 'pending' | 'success' | 'needs-sign-in' | 'denied' | 'invalid' | 'error'

/** Shown after "This wasn't me" goes through. */
export const DENIED_MESSAGE = 'Thanks — we’ve locked that account. You can ignore the email.'
/** Shown when "This wasn't me" fails with no usable server message. */
const DENY_FAILED_MESSAGE = 'We couldn’t lock that account. Please try again in a moment.'

/** What POST /api/auth/confirm answers with a 200. */
interface ConfirmResponse {
  ok?: boolean
  email?: unknown
  needsSignIn?: boolean
}

/**
 * Tells the server the visitor never created this account ("This wasn't
 * me"): the token is spent and an unverified account is locked.
 * @param token - The confirmation token from the email link
 * @throws With the server's own text (or a fallback) when it refuses
 */
async function denyConfirmation(token: string): Promise<void> {
  const res = await fetch('/api/auth/confirm/deny', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ token }),
  })
  if (res.ok) return
  const body = (await res.json().catch(() => ({}))) as { error?: unknown }
  throw new Error(typeof body.error === 'string' && body.error !== '' ? body.error : DENY_FAILED_MESSAGE)
}

/**
 * Email confirmation page.
 *
 * Reads `?token=` on mount and POSTs it. Confirmation is not a login gate —
 * this page only records that the address works, then points the visitor
 * onward. The server confirms only for the account's own session; opened
 * anywhere else, the link is left unspent and the page asks the visitor to
 * sign in (and come back here), or to say "This wasn't me", which locks an
 * account someone else created with their address.
 */
export function ConfirmPage() {
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  const { user, refresh } = useAuth()
  const [status, setStatus] = useState<Status>(token ? 'pending' : 'invalid')
  const [email, setEmail] = useState<string | null>(null)
  const [confirmingDeny, setConfirmingDeny] = useState(false)
  const [denying, setDenying] = useState(false)
  const [denyError, setDenyError] = useState<string | null>(null)
  const denyingRef = useRef(false)
  const cancelDenyRef = useRef<HTMLButtonElement>(null)
  const denyButtonRef = useRef<HTMLButtonElement>(null)
  const returnFocusRef = useRef(false)

  useEffect(() => {
    if (!token) {
      setStatus('invalid')
      return
    }
    let cancelled = false
    setStatus('pending')
    fetch('/api/auth/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ token }),
    })
      .then(async (res) => {
        const body = (await res.json().catch(() => ({}))) as ConfirmResponse
        if (cancelled) return
        setEmail(typeof body.email === 'string' ? body.email : null)
        if (res.ok && body.ok) {
          setStatus('success')
          await refresh()
        } else if (res.ok && body.needsSignIn === true) {
          setStatus('needs-sign-in')
        } else {
          setStatus('invalid')
        }
      })
      .catch(() => {
        if (!cancelled) setStatus('error')
      })
    return () => {
      cancelled = true
    }
  }, [token, refresh])

  // Opening the "This wasn't me" confirm focuses its safe choice, Cancel;
  // cancelling puts focus back on the button that opened it.
  useEffect(() => {
    if (confirmingDeny) cancelDenyRef.current?.focus()
    else if (returnFocusRef.current) {
      returnFocusRef.current = false
      denyButtonRef.current?.focus()
    }
  }, [confirmingDeny])

  /** "Yes, lock it": spends the link and locks the account. */
  async function onDeny(): Promise<void> {
    if (denyingRef.current) return
    denyingRef.current = true
    setDenying(true)
    setDenyError(null)
    try {
      await denyConfirmation(token)
      setStatus('denied')
    } catch (err) {
      logger.error('confirm deny failed', err)
      setDenyError(err instanceof Error ? err.message : DENY_FAILED_MESSAGE)
    } finally {
      denyingRef.current = false
      setDenying(false)
    }
  }

  const confirmPath = `/confirm?token=${encodeURIComponent(token)}`

  return (
    <>
      <Seo title="Confirm your email" description="Confirm the email address on your Trip One account." noindex />
      <PageShell title="Confirm your email" crumbs={[{ label: 'Home', to: '/' }, { label: 'Confirm email' }]}>
        <div aria-live="polite" className="max-w-sm space-y-4">
          {status === 'pending' && <p className="opacity-80">Confirming your email…</p>}

          {status === 'success' && (
            <>
              <p>
                {email ? <strong>{email}</strong> : 'Your email'} is confirmed. You can reset your password from this
                address if you ever need to.
              </p>
              <ButtonLink to={user ? '/my-trips' : '/login'} size="lg" block>
                {user ? 'Go to my trips' : 'Sign in'}
              </ButtonLink>
            </>
          )}

          {status === 'needs-sign-in' && (
            <>
              <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold">Sign in to confirm your email</h2>
              <p>
                To confirm {email ? <strong>{email}</strong> : 'this address'}, sign in to that account. You’ll come back
                here and it will be confirmed.
              </p>
              <ButtonLink to="/login" state={{ from: confirmPath }} size="lg" block>
                Sign in
              </ButtonLink>
              <div className="border-t border-[var(--hairline)] pt-4">
                <p className="text-sm opacity-80">Didn’t create a Trip One account with this email?</p>
                {confirmingDeny ? (
                  <div className="mt-3 space-y-3">
                    <p className="text-sm">
                      Lock this account? Whoever signed up with your email won’t be able to use it.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" variant="danger" loading={denying} onClick={() => void onDeny()}>
                        Yes, lock it
                      </Button>
                      <Button
                        ref={cancelDenyRef}
                        type="button"
                        variant="secondary"
                        onClick={() => {
                          returnFocusRef.current = true
                          setConfirmingDeny(false)
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                    {denyError && (
                      <p role="alert" className="text-sm text-[var(--accent-danger-text)]">
                        {denyError}
                      </p>
                    )}
                  </div>
                ) : (
                  <Button
                    ref={denyButtonRef}
                    type="button"
                    variant="secondary"
                    className="mt-3"
                    onClick={() => setConfirmingDeny(true)}
                  >
                    This wasn’t me
                  </Button>
                )}
              </div>
            </>
          )}

          {status === 'denied' && <p>{DENIED_MESSAGE}</p>}

          {status === 'invalid' && (
            <>
              <p>
                This confirmation link is invalid or has expired. Sign in and request a new one from your trips page.
              </p>
              <ButtonLink to={user ? '/my-trips' : '/login'} size="lg" block>
                {user ? 'Go to my trips' : 'Sign in'}
              </ButtonLink>
            </>
          )}

          {status === 'error' && (
            <>
              <p>We couldn't confirm your email. Check your connection and try again.</p>
              <p className="text-sm opacity-80">
                Or <Link to="/login" className="text-[var(--accent-text)] underline underline-offset-4">sign in</Link>{' '}
                and request a new link from your trips page.
              </p>
            </>
          )}
        </div>
      </PageShell>
    </>
  )
}
