import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from './AuthContext'
import { Button, ButtonLink } from '../../components/ui/Button'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { Seo } from '../../components/Seo'
import { PageShell } from '../../components/layout/PageShell'
import { DestinationImage } from '../../components/DestinationImage'

interface SavedTrip {
  id: string
  location_slug: string
  location_name?: string
  title?: string | null
  trip_length_days?: number | null
  created_at: string
}

/** Turns a slug back into something readable when the join found no location row. */
function readableName(trip: SavedTrip): string {
  if (trip.title) return trip.title
  if (trip.location_name) return trip.location_name
  return trip.location_slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

export function MyTripsPage() {
  const { user, loading: authLoading } = useAuth()
  const navigate = useNavigate()

  const [trips, setTrips] = useState<SavedTrip[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<SavedTrip | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Wait for auth to settle before redirecting: acting on the initial `null`
  // would bounce a signed-in user to the login page on every refresh.
  useEffect(() => {
    if (!authLoading && !user) navigate('/login', { replace: true, state: { from: '/my-trips' } })
  }, [authLoading, user, navigate])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/my-trips', { credentials: 'same-origin' })
      if (!res.ok) throw new Error('Could not load your trips.')
      const body = (await res.json()) as { trips: SavedTrip[] }
      setTrips(body.trips ?? [])
    } catch {
      setError('We could not load your trips. Please try again.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (user) void load()
  }, [user, load])

  async function confirmDelete() {
    if (!pendingDelete) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/trips/${pendingDelete.id}`, { method: 'DELETE', credentials: 'same-origin' })
      if (!res.ok) throw new Error('delete failed')
      setTrips((current) => current.filter((t) => t.id !== pendingDelete.id))
      setPendingDelete(null)
    } catch {
      setError('We could not delete that trip. Please try again.')
      setPendingDelete(null)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <>
      <Seo title="My trips" description="The trips you've saved to your Trip One account." noindex />
      <PageShell
        title="My trips"
        lead={user?.displayName ? `Welcome back, ${user.displayName}.` : undefined}
        crumbs={[{ label: 'Home', to: '/' }, { label: 'My trips' }]}
        wide
      >
        {error && (
          <div role="alert" className="mb-6 rounded-xl border border-danger-500/30 bg-danger-50 px-4 py-3 text-sm text-danger-600 dark:bg-danger-500/10">
            {error}{' '}
            <button onClick={() => void load()} className="underline underline-offset-4">
              Retry
            </button>
          </div>
        )}

        {loading ? (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {/* Skeletons match the real card's shape, so nothing jumps when
                the data arrives. */}
            {[0, 1, 2].map((i) => (
              <li key={i} className="overflow-hidden rounded-[var(--radius-card)] border border-[var(--hairline)]">
                <div className="h-36 animate-pulse bg-[var(--surface-muted)]" />
                <div className="space-y-2 p-4">
                  <div className="h-5 w-2/3 animate-pulse rounded bg-[var(--surface-muted)]" />
                  <div className="h-4 w-1/3 animate-pulse rounded bg-[var(--surface-muted)]" />
                </div>
              </li>
            ))}
          </ul>
        ) : trips.length === 0 ? (
          <div className="rounded-[var(--radius-card)] border border-dashed border-[var(--hairline)] p-10 text-center">
            <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold">No saved trips yet</h2>
            <p className="mx-auto mt-2 max-w-sm opacity-75">
              Plan a trip and it will appear here, on every device you sign in from.
            </p>
            <ButtonLink to="/" size="lg" className="mt-6">
              Plan your first trip
            </ButtonLink>
          </div>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {trips.map((trip) => (
              <li
                key={trip.id}
                className="group flex flex-col overflow-hidden rounded-[var(--radius-card)] border border-[var(--hairline)] bg-[var(--surface)] shadow-[var(--shadow-card)] transition-shadow hover:shadow-[var(--shadow-lifted)]"
              >
                <Link to={`/trip/${trip.id}`} className="block">
                  <DestinationImage slug={trip.location_slug} alt="" className="h-36 w-full object-cover" />
                </Link>
                <div className="flex flex-1 flex-col p-4">
                  <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold leading-snug">
                    <Link to={`/trip/${trip.id}`} className="hover:text-[var(--accent-text)]">
                      {readableName(trip)}
                    </Link>
                  </h2>
                  <p className="mt-1 text-sm opacity-70">
                    {trip.trip_length_days ? `${trip.trip_length_days} days · ` : ''}
                    Saved {formatDate(trip.created_at)}
                  </p>
                  <div className="mt-4 flex items-center gap-2 pt-2">
                    <ButtonLink to={`/trip/${trip.id}`} size="sm" variant="secondary">
                      Open
                    </ButtonLink>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="ml-auto text-danger-500 hover:bg-danger-50"
                      onClick={() => setPendingDelete(trip)}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </PageShell>

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete this trip?"
        // Naming the specific trip prevents the classic mistake of confirming
        // a destructive action on the wrong row.
        body={
          <>
            <strong>{pendingDelete ? readableName(pendingDelete) : ''}</strong> will be permanently deleted, along with
            its itinerary. This cannot be undone.
          </>
        }
        confirmLabel={deleting ? 'Deleting…' : 'Delete trip'}
        busy={deleting}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setPendingDelete(null)}
      />
    </>
  )
}
