import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from './AuthContext'
import { Button } from '../../components/ui/Button'
import { Field, FormError } from '../../components/ui/Field'
import { Seo } from '../../components/Seo'
import { PageShell } from '../../components/layout/PageShell'

/**
 * Sign-in page.
 *
 * After a successful sign in it returns the user to wherever they were headed
 * (`location.state.from`), falling back to their trips — being bounced to the
 * homepage after signing in from a protected page is a small but real
 * annoyance.
 */
export function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from ?? '/my-trips'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await login({ email, password })
      navigate(from, { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign you in.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <Seo
        title="Sign in"
        description="Sign in to Trip One to see the trips you've saved and pick up where you left off."
        noindex
      />
      <PageShell title="Welcome back" lead="Sign in to see the trips you've saved." crumbs={[{ label: 'Home', to: '/' }, { label: 'Sign in' }]}>
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
          <Field
            label="Password"
            type="password"
            name="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <Button type="submit" size="lg" block loading={submitting}>
            {submitting ? 'Signing in…' : 'Sign in'}
          </Button>
          <p className="text-sm opacity-80">
            No account?{' '}
            <Link to="/register" className="text-[var(--accent-text)] underline underline-offset-4">
              Create one
            </Link>
          </p>
        </form>
      </PageShell>
    </>
  )
}
