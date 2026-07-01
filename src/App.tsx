import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, useParams } from 'react-router-dom'
import { useTripStore, type DesignStyle } from './store/tripStore'
import { ThemeSwitcher } from './components/ThemeSwitcher'
import { ErrorBoundary } from './components/ErrorBoundary'
import { getTrip } from './lib/api/client'
import { logger } from './lib/logger'
import * as bento from './themes/bento/SearchScreen'
import * as bentoOverview from './themes/bento/OverviewScreen'
import * as bentoItinerary from './themes/bento/ItineraryScreen'
import * as bentoThings from './themes/bento/ThingsToDoScreen'
import * as chronicleOverview from './themes/chronicle/OverviewScreen'
import * as chronicleItinerary from './themes/chronicle/ItineraryScreen'
import * as chronicleThings from './themes/chronicle/ThingsToDoScreen'
import * as fieldGuideOverview from './themes/field-guide/OverviewScreen'
import * as fieldGuideItinerary from './themes/field-guide/ItineraryScreen'
import * as fieldGuideThings from './themes/field-guide/ThingsToDoScreen'
import * as liquidGlassOverview from './themes/liquid-glass/OverviewScreen'
import * as liquidGlassItinerary from './themes/liquid-glass/ItineraryScreen'
import * as liquidGlassThings from './themes/liquid-glass/ThingsToDoScreen'
import * as trailLedgerOverview from './themes/trail-ledger/OverviewScreen'
import * as trailLedgerItinerary from './themes/trail-ledger/ItineraryScreen'
import * as trailLedgerThings from './themes/trail-ledger/ThingsToDoScreen'
import './themes/bento/bento.css'
import './themes/chronicle/chronicle.css'
import './themes/field-guide/field-guide.css'
import './themes/liquid-glass/liquid-glass.css'
import './themes/trail-ledger/trail-ledger.css'

const OVERVIEW_BY_THEME: Record<DesignStyle, React.ComponentType> = {
  bento: bentoOverview.OverviewScreen,
  chronicle: chronicleOverview.OverviewScreen,
  'field-guide': fieldGuideOverview.OverviewScreen,
  'liquid-glass': liquidGlassOverview.OverviewScreen,
  'trail-ledger': trailLedgerOverview.OverviewScreen,
}

const ITINERARY_BY_THEME: Record<DesignStyle, React.ComponentType> = {
  bento: bentoItinerary.ItineraryScreen,
  chronicle: chronicleItinerary.ItineraryScreen,
  'field-guide': fieldGuideItinerary.ItineraryScreen,
  'liquid-glass': liquidGlassItinerary.ItineraryScreen,
  'trail-ledger': trailLedgerItinerary.ItineraryScreen,
}

const THINGS_TO_DO_BY_THEME: Record<DesignStyle, React.ComponentType<{ locationSlug: string }>> = {
  bento: bentoThings.ThingsToDoScreen,
  chronicle: chronicleThings.ThingsToDoScreen,
  'field-guide': fieldGuideThings.ThingsToDoScreen,
  'liquid-glass': liquidGlassThings.ThingsToDoScreen,
  'trail-ledger': trailLedgerThings.ThingsToDoScreen,
}

function TripOverview() {
  const { id } = useParams<{ id: string }>()
  const designStyle = useTripStore((s) => s.designStyle)
  const Overview = OVERVIEW_BY_THEME[designStyle]
  return (
    <>
      {id && <ThemeSwitcher tripId={id} />}
      <Overview />
    </>
  )
}

function TripItinerary() {
  const designStyle = useTripStore((s) => s.designStyle)
  const Itinerary = ITINERARY_BY_THEME[designStyle]
  return <Itinerary />
}

/**
 * Resolves the trip's location slug from the route param before rendering
 * the current theme's `ThingsToDoScreen`, which needs a concrete location
 * slug rather than a trip id.
 */
function ThingsToDoRoute() {
  const { id } = useParams<{ id: string }>()
  const designStyle = useTripStore((s) => s.designStyle)
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

  const ThingsToDo = THINGS_TO_DO_BY_THEME[designStyle]
  return <ThingsToDo locationSlug={locationSlug} />
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/"
          element={
            <ErrorBoundary label="Search">
              <bento.SearchScreen />
            </ErrorBoundary>
          }
        />
        <Route
          path="/trip/:id"
          element={
            <ErrorBoundary label="Overview">
              <TripOverview />
            </ErrorBoundary>
          }
        />
        <Route
          path="/trip/:id/itinerary"
          element={
            <ErrorBoundary label="Itinerary">
              <TripItinerary />
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
