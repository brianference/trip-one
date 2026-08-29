import { useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Button, ButtonLink } from '../../components/ui/Button'
import { Field, FormError } from '../../components/ui/Field'
import { Seo } from '../../components/Seo'
import { PageShell } from '../../components/layout/PageShell'

/** Mirrors the server's minimum so the user learns it before submitting. */
const MIN_PASSWORD_LENGTH = 10

/**
 * Password-reset page. Reads `?token=` and takes a new password.
 *
 * On success the previous sessions are dead (the server bumped token_version),
 * so this page points at sign-in rather than pretending the old cookie still
 * works.
 */
export function ResetPage() {
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''

  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [fieldError, setFieldError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setFieldError(null)

    if (password.length < MIN_PASSWORD_LENGTH) {
      setFieldError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`)
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/auth/password/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ token, password }),
      })
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string }
      if (!res.ok) {
        setError(typeof body.error === 'string' ? body.error : 'Could not update your password.')
        return
      }
      setDone(true)
    } catch {
      setError('Could not reach the server. Check your connection and try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <Seo title="Set a new password" description="Choose a new password for your Trip One account." noindex />
      <PageShell title="Set a new password" crumbs={[{ label: 'Home', to: '/' }, { label: 'Reset password' }]}>
        {!token ? (
          <div className="max-w-sm space-y-4">
            <p>This reset link is missing its token. Request a new one.</p>
            <ButtonLink to="/forgot" size="lg" block>
              Request a new link
            </ButtonLink>
          </div>
        ) : done ? (
          <div aria-live="polite" className="max-w-sm space-y-4">
            <p>Your password has been updated. Sign in with your new password.</p>
            <ButtonLink to="/login" size="lg" block>
              Sign in
            </ButtonLink>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="max-w-sm space-y-4" noValidate>
            <FormError>{error}</FormError>
            <Field
              label="New password"
              type="password"
              name="password"
              autoComplete="new-password"
              required
              value={password}
              minLength={MIN_PASSWORD_LENGTH}
              onChange={(e) => {
                setPassword(e.target.value)
                if (fieldError && e.target.value.length >= MIN_PASSWORD_LENGTH) setFieldError(null)
              }}
              onBlur={(e) =>
                setFieldError(
                  e.target.value.length > 0 && e.target.value.length < MIN_PASSWORD_LENGTH
                    ? `Password must be at least ${MIN_PASSWORD_LENGTH} characters`
                    : null,
                )
              }
              error={fieldError}
              hint={`At least ${MIN_PASSWORD_LENGTH} characters. A short phrase works well.`}
            />
            <Button type="submit" size="lg" block loading={submitting}>
              {submitting ? 'Updating…' : 'Update password'}
            </Button>
            <p className="text-sm opacity-80">
              Link expired?{' '}
              <Link to="/forgot" className="text-[var(--accent-text)] underline underline-offset-4">
                Request a new one
              </Link>
            </p>
          </form>
        )}
      </PageShell>
    </>
  )
}
