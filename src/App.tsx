import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, useParams } from 'react-router-dom'
import { SearchScreen } from './themes/bento/SearchScreen'
import { OverviewScreen } from './themes/bento/OverviewScreen'
import { ItineraryScreen } from './themes/bento/ItineraryScreen'
import { ThingsToDoScreen } from './themes/bento/ThingsToDoScreen'
import { ErrorBoundary } from './components/ErrorBoundary'
import { getTrip } from './lib/api/client'
import { logger } from './lib/logger'
import './themes/bento/bento.css'

/**
 * Resolves the trip's location slug from the route param before rendering
 * `ThingsToDoScreen`, which needs a concrete location slug rather than a
 * trip id.
 */
function ThingsToDoRoute() {
  const { id } = useParams<{ id: string }>()
  const [locationSlug, setLocationSlug] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    let cancelled = false
    getTrip(id)
      .then((trip) => {
        if (!cancelled) setLocationSlug(trip.locationSlug)
      })
      .catch((err) => {
        logger.error('failed to load trip for things-to-do', err)
      })
    return () => {
      cancelled = true
    }
  }, [id])

  if (!locationSlug) return <p>Loading…</p>

  return <ThingsToDoScreen locationSlug={locationSlug} />
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/"
          element={
            <ErrorBoundary label="Search">
              <SearchScreen />
            </ErrorBoundary>
          }
        />
        <Route
          path="/trip/:id"
          element={
            <ErrorBoundary label="Overview">
              <OverviewScreen />
            </ErrorBoundary>
          }
        />
        <Route
          path="/trip/:id/itinerary"
          element={
            <ErrorBoundary label="Itinerary">
              <ItineraryScreen />
            </ErrorBoundary>
          }
        />
        <Route
          path="/trip/:id/things-to-do"
          element={
            <ErrorBoundary label="Things to do">
              <ThingsToDoRoute />
            </ErrorBoundary>
          }
        />
      </Routes>
    </BrowserRouter>
  )
}
