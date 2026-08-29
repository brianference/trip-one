import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '../../components/ui/Button'
import { Field, FormError } from '../../components/ui/Field'
import { Seo } from '../../components/Seo'
import { PageShell } from '../../components/layout/PageShell'

/**
 * The same confirmation text is always shown, whether or not the account
 * exists. Revealing "no such account" from this page would turn it into an
 * account-enumeration oracle.
 */
const SENT_COPY =
  "If an account exists for that address, we've sent a link to reset the password. Check your inbox, and your spam folder."

/**
 * Forgot-password page. Email only.
 */
export function ForgotPage() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const res = await fetch('/api/auth/password/reset-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ email }),
      })
      // Always treat a 200 the same. A 4xx is a malformed address, not "no
      // such account" — the server never distinguishes the latter.
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string }
        if (res.status === 429) {
          setError('Too many attempts. Please try again later.')
        } else {
          setError(typeof body.error === 'string' ? body.error : 'Please enter a valid email address.')
        }
        return
      }
      setSent(true)
    } catch {
      setError('Could not reach the server. Check your connection and try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <Seo
        title="Forgot password"
        description="Reset the password on your Trip One account."
        noindex
      />
      <PageShell
        title="Forgot your password?"
        lead="Enter the email on the account and we'll send a reset link if it exists."
        crumbs={[{ label: 'Home', to: '/' }, { label: 'Forgot password' }]}
      >
        {sent ? (
          <p aria-live="polite" className="max-w-sm">
            {SENT_COPY}
          </p>
        ) : (
          <form onSubmit={onSubmit} className="max-w-sm space-y-4" noValidate>
            <FormError>{error}</FormError>
            <Field
              label="Email"
              type="email"
              name="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
            <Button type="submit" size="lg" block loading={submitting}>
              {submitting ? 'Sending…' : 'Send reset link'}
            </Button>
            <p className="text-sm opacity-80">
              Remembered it?{' '}
              <Link to="/login" className="text-[var(--accent-text)] underline underline-offset-4">
                Sign in
              </Link>
            </p>
          </form>
        )}
      </PageShell>
    </>
  )
}
