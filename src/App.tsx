import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { ErrorBoundary } from './components/ErrorBoundary'
import { ThemeToggle } from './components/ThemeToggle'
import { ScrollToTop } from './components/ScrollToTop'
import { PrivacyPage } from './features/legal/PrivacyPage'
import { SearchScreen } from './themes/chronicle/SearchScreen'
import { TripShell } from './features/trip/TripShell'
import { OverviewPage } from './features/trip/pages/OverviewPage'
import { TripPlanPage } from './features/trip/pages/TripPlanPage'
import { WeatherPage } from './features/trip/pages/WeatherPage'
import { PhrasebookPage } from './features/trip/pages/PhrasebookPage'
import './themes/chronicle/chronicle.css'

// Chronicle is the app's only theme: the homepage and every trip page render
// through it, via real nested routes rather than a theme-dispatch map. Bento,
// Field Guide, Trail Ledger, and Liquid Glass source stays in the repo
// (unreferenced) in case any of them is wanted back later, but nothing here
// imports or routes to them anymore.
export default function App() {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <ThemeToggle />
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
          {/* The consolidated map + itinerary + things-to-do page. The old
              separate routes alias to it so existing links keep working. */}
          <Route path="plan" element={<TripPlanPage />} />
          <Route path="itinerary" element={<TripPlanPage />} />
          <Route path="map" element={<TripPlanPage />} />
          <Route path="things-to-do" element={<TripPlanPage />} />
          <Route path="weather" element={<WeatherPage />} />
          <Route path="phrasebook" element={<PhrasebookPage />} />
          {/* Alias: older links/bookmarks to the former Info page still resolve. */}
          <Route path="local-info" element={<WeatherPage />} />
        </Route>
        <Route path="/privacy" element={<PrivacyPage />} />
      </Routes>
    </BrowserRouter>
  )
}
