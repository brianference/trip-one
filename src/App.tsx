import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { ErrorBoundary } from './components/ErrorBoundary'
import { SearchScreen } from './themes/chronicle/SearchScreen'
import { TripShell } from './features/trip/TripShell'
import { OverviewPage } from './features/trip/pages/OverviewPage'
import { ItineraryPage } from './features/trip/pages/ItineraryPage'
import { MapPage } from './features/trip/pages/MapPage'
import { ThingsToDoPage } from './features/trip/pages/ThingsToDoPage'
import { LocalInfoPage } from './features/trip/pages/LocalInfoPage'
import './themes/chronicle/chronicle.css'

// Chronicle is the app's only theme: the homepage and every trip page render
// through it, via real nested routes rather than a theme-dispatch map. Bento,
// Field Guide, Trail Ledger, and Liquid Glass source stays in the repo
// (unreferenced) in case any of them is wanted back later, but nothing here
// imports or routes to them anymore.
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
            <ErrorBoundary label="Trip">
              <TripShell />
            </ErrorBoundary>
          }
        >
          <Route index element={<OverviewPage />} />
          <Route path="itinerary" element={<ItineraryPage />} />
          <Route path="map" element={<MapPage />} />
          <Route path="things-to-do" element={<ThingsToDoPage />} />
          <Route path="local-info" element={<LocalInfoPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
