import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from './AuthContext'
import { Button } from '../../components/ui/Button'
import { Field, FormError } from '../../components/ui/Field'
import { Seo } from '../../components/Seo'
import { PageShell } from '../../components/layout/PageShell'

/** Mirrors the server's minimum so the user learns it before submitting. */
const MIN_PASSWORD_LENGTH = 10

export function RegisterPage() {
  const { register } = useAuth()
  const navigate = useNavigate()

  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [fieldError, setFieldError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setFieldError(null)

    // Checked here as well as on the server: the point is fast feedback, not
    // trust. The server validates independently and is the real gate.
    if (password.length < MIN_PASSWORD_LENGTH) {
      setFieldError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`)
      return
    }

    setSubmitting(true)
    try {
      // If this visitor planned a trip before signing up, carry it into the new
      // account instead of losing the thing that prompted them to register.
      const claimTripId = sessionStorage.getItem('trip-one:last-trip') ?? undefined
      await register({ email, password, displayName: displayName.trim() || undefined, claimTripId })
      navigate('/my-trips', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create your account.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <Seo
        title="Create an account"
        description="Create a free Trip One account to save your itineraries and pick them up on any device."
      />
      <PageShell
        title="Create your account"
        lead="Save your itineraries and pick them up on any device."
        crumbs={[{ label: 'Home', to: '/' }, { label: 'Create account' }]}
      >
        <form onSubmit={onSubmit} className="max-w-sm space-y-4" noValidate>
          <FormError>{error}</FormError>
          <Field
            label="Name"
            name="name"
            autoComplete="name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            hint="Optional — what we'll call you."
            placeholder="Alex"
          />
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
          <Field
            label="Password"
            type="password"
            name="password"
            autoComplete="new-password"
            required
            value={password}
            minLength={MIN_PASSWORD_LENGTH}
            onChange={(e) => {
              setPassword(e.target.value)
              // Clear the error as soon as the value becomes valid, rather than
              // making the user submit again to find out they fixed it.
              if (fieldError && e.target.value.length >= MIN_PASSWORD_LENGTH) setFieldError(null)
            }}
            // Validate when they leave the field, so the requirement is known
            // before they reach the submit button.
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
            {submitting ? 'Creating your account…' : 'Create account'}
          </Button>
          <p className="text-sm opacity-80">
            Already have an account?{' '}
            <Link to="/login" className="text-[var(--accent-text)] underline underline-offset-4">
              Sign in
            </Link>
          </p>
          <p className="text-xs opacity-65">
            By creating an account you agree to our{' '}
            <Link to="/terms" className="underline underline-offset-4">
              Terms
            </Link>{' '}
            and{' '}
            <Link to="/privacy" className="underline underline-offset-4">
              Privacy Policy
            </Link>
            .
          </p>
        </form>
      </PageShell>
    </>
  )
}
