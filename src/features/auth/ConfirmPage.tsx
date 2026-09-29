import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Seo } from '../../components/Seo'
import { PageShell } from '../../components/layout/PageShell'
import { ButtonLink } from '../../components/ui/Button'
import { useAuth } from './AuthContext'

/** `reset`: confirmed, and the password was reset because the link was opened without the account's session. */
type Status = 'pending' | 'success' | 'reset' | 'invalid' | 'error'

/**
 * Email confirmation page.
 *
 * Reads `?token=` on mount and POSTs it. Confirmation is not a login gate —
 * this page only records that the address works, then points the visitor
 * onward. When the server reports `passwordReset` (the link was opened
 * without the account's own session, so any password someone else chose was
 * wiped), it sends the visitor to set a password through the reset flow.
 */
export function ConfirmPage() {
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  const { user, refresh } = useAuth()
  const [status, setStatus] = useState<Status>(token ? 'pending' : 'invalid')
  const [email, setEmail] = useState<string | null>(null)

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
        const body = (await res.json().catch(() => ({}))) as { ok?: boolean; email?: string; passwordReset?: boolean }
        if (cancelled) return
        if (res.ok && body.ok) {
          setEmail(typeof body.email === 'string' ? body.email : null)
          setStatus(body.passwordReset === true ? 'reset' : 'success')
          await refresh()
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

          {status === 'reset' && (
            <>
              <p>Your email is confirmed. For your security, set a password to sign in.</p>
              <ButtonLink to="/forgot" state={email ? { email } : undefined} size="lg" block>
                Set a password
              </ButtonLink>
            </>
          )}

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
