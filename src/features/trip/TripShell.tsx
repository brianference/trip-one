import { useEffect, useState } from 'react'
import { useParams, Outlet, Link } from 'react-router-dom'
import { useTripData } from './hooks/useTripData'
import { TripNav } from './TripNav'
import { TripChatDock } from './chat/TripChatDock'
import { TripSkeleton } from './components/TripSkeleton'
import { SaveErrorBanner } from './components/SaveErrorBanner'
import { CurrencyTool } from './components/CurrencyTool'
import { recordRecentTrip } from './recentTrips'
import { useForecast } from '../weather/useForecast'
import { currencyForDisplayName } from '../localinfo/currencyByCountry'
import { useCurrencyRate } from '../localinfo/useCurrencyRate'
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
  // Current temperature for the nav's Weather item — visible from any page.
  const { data: forecast } = useForecast(location?.lat ?? 0, location?.lng ?? 0)
  // Destination currency (for the header converter), resolved once here.
  const currencyCode = location ? currencyForDisplayName(location.displayName) : 'USD'
  const { rate: currencyRate } = useCurrencyRate(currencyCode)

  // Remember this trip for the homepage "Continue" list once it has a name.
  const tripName = location?.displayName
  useEffect(() => {
    if (id && tripName) recordRecentTrip(id, tripName)
  }, [id, tripName])

  // Give the browser tab (and link unfurls that read the live title) the
  // destination name; restore the default when leaving the trip.
  useEffect(() => {
    if (!tripName) return
    const previous = document.title
    document.title = `${tripName} — Trip One`
    return () => {
      document.title = previous
    }
  }, [tripName])

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
        <main className="chronicle-book">
          <TripSkeleton />
        </main>
      </div>
    )
  }

  return (
    <div className={`chronicle-page chronicle-trip-page${chatOpen ? ' chronicle-trip-page--chat-open' : ''}`}>
      <TripChatDock trip={trip} location={location} open={chatOpen} onOpenChange={setChatOpen} />
      <div className="chronicle-trip-header">
        <TripNav tripId={id} variant="pill" currentTempF={forecast?.temperatureF ?? null} />
        <CurrencyTool code={currencyCode} rate={currencyRate} />
      </div>
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
