import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, Outlet, Link } from 'react-router-dom'
import type { ThingToDo } from '../../lib/api/client'
import { useTripData } from './hooks/useTripData'
import { TripNav } from './TripNav'
import { TripChatDock } from './chat/TripChatDock'
import { TripSkeleton } from './components/TripSkeleton'
import { SaveErrorBanner } from './components/SaveErrorBanner'
import { CurrencyTool } from './components/CurrencyTool'
import { Logo } from '../../components/Logo'
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
  // Places the chat found on demand (a nearby "sushi" / "rooftop bar" search)
  // are merged into the location so they show on the map and stay available to
  // later turns. Reset when switching trips.
  const [extraPlaces, setExtraPlaces] = useState<ThingToDo[]>([])
  useEffect(() => setExtraPlaces([]), [id])
  const addPlaces = useCallback(
    (found: ThingToDo[]) =>
      setExtraPlaces((prev) => {
        const seen = new Set([...prev, ...(location?.thingsToDo ?? [])].map((p) => p.name.toLowerCase()))
        return [...prev, ...found.filter((p) => !seen.has(p.name.toLowerCase()))]
      }),
    [location],
  )
  const mergedLocation = useMemo(
    () => (location ? { ...location, thingsToDo: [...location.thingsToDo, ...extraPlaces] } : null),
    [location, extraPlaces],
  )

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
      <TripChatDock trip={trip} location={mergedLocation} open={chatOpen} onOpenChange={setChatOpen} onAddPlaces={addPlaces} />
      {/* Mobile-only compact top bar: brand + at-a-glance temp and currency.
          Hidden on desktop, where the same currency lives in the header card. */}
      <div className="chronicle-trip-topbar">
        <Link to="/" className="chronicle-topbar-brand" aria-label="Trip One home">
          <Logo size={20} />
        </Link>
        <div className="chronicle-topbar-meta">
          {forecast?.temperatureF != null && (
            <span className="chronicle-topbar-temp">
              <span aria-hidden="true">☀</span> {Math.round(forecast.temperatureF)}°
            </span>
          )}
          <CurrencyTool code={currencyCode} rate={currencyRate} variant="compact" />
        </div>
      </div>
      <div className="chronicle-trip-header">
        <TripNav tripId={id} variant="pill" currentTempF={forecast?.temperatureF ?? null} />
        <div className="chronicle-header-utility">
          <CurrencyTool code={currencyCode} rate={currencyRate} />
        </div>
      </div>
      <SaveErrorBanner />
      <main className="chronicle-book">
        <ErrorBoundary label="Trip">
          <Outlet context={{ trip, location: mergedLocation }} />
        </ErrorBoundary>
      </main>
      <footer className="chronicle-page-footer">
        <TripNav tripId={id} variant="footer" />
        <p className="chronicle-footer-note">Real weather, maps, and nearby places — refreshed each time you visit.</p>
      </footer>
    </div>
  )
}
