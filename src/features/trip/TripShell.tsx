import { useState } from 'react'
import { useParams, Outlet, Link } from 'react-router-dom'
import { useTripData } from './hooks/useTripData'
import { TripNav } from './TripNav'
import { TripChatDock } from './chat/TripChatDock'
import { SaveErrorBanner } from './components/SaveErrorBanner'
import { ErrorBoundary } from '../../components/ErrorBoundary'

/** Start with the dock open on desktop-width screens, collapsed on mobile. */
function initialChatOpen(): boolean {
  return typeof window !== 'undefined' && window.innerWidth >= 1024
}

/**
 * Persistent shell for every page under `/trip/:id/*`: loads the trip and
 * its location once (child pages read it via `useTripContext`, so
 * switching pages never re-fetches), then renders the sticky nav, the
 * active page, and a footer that repeats the same links — so a lost mobile
 * user is never more than one tap from any page.
 */
export function TripShell() {
  const { id } = useParams<{ id: string }>()
  const { trip, location, loading, error } = useTripData(id ?? '')
  const [chatOpen, setChatOpen] = useState(initialChatOpen)

  if (!id) return null

  if (error) {
    return (
      <div className="chronicle-page">
        <article className="chronicle-chapter" role="alert">
          <h1>Trip not found</h1>
          <p className="chronicle-rate-line">
            We couldn’t load this trip. It may have been removed, or the link may be wrong.
          </p>
          <Link to="/" className="chronicle-preview-link">
            Plan a new trip →
          </Link>
        </article>
      </div>
    )
  }

  if (loading || !trip) {
    return (
      <div className="chronicle-page">
        <p>Loading…</p>
      </div>
    )
  }

  return (
    <div className={`chronicle-page chronicle-trip-page${chatOpen ? ' chronicle-trip-page--chat-open' : ''}`}>
      <TripChatDock trip={trip} location={location} open={chatOpen} onOpenChange={setChatOpen} />
      <TripNav tripId={id} variant="pill" />
      <SaveErrorBanner />
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
