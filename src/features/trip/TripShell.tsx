import { useParams, Outlet } from 'react-router-dom'
import { useTripData } from './hooks/useTripData'
import { TripNav } from './TripNav'
import { ErrorBoundary } from '../../components/ErrorBoundary'

/**
 * Persistent shell for every page under `/trip/:id/*`: loads the trip and
 * its location once (child pages read it via `useTripContext`, so
 * switching pages never re-fetches), then renders the sticky nav, the
 * active page, and a footer that repeats the same links — so a lost mobile
 * user is never more than one tap from any page.
 */
export function TripShell() {
  const { id } = useParams<{ id: string }>()
  const { trip, location, loading } = useTripData(id ?? '')

  if (!id) return null
  if (loading || !trip) {
    return (
      <div className="chronicle-page">
        <p>Loading…</p>
      </div>
    )
  }

  return (
    <div className="chronicle-page">
      <TripNav tripId={id} variant="pill" />
      <main className="chronicle-book">
        <ErrorBoundary label="Trip">
          <Outlet context={{ trip, location }} />
        </ErrorBoundary>
      </main>
      <footer className="chronicle-page-footer">
        <TripNav tripId={id} variant="footer" />
        <p className="chronicle-footer-note">Real weather, maps, and nearby places — refreshed each time you visit.</p>
      </footer>
    </div>
  )
}
