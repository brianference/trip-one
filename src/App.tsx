import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import { ErrorBoundary } from './components/ErrorBoundary'
import { ScrollToTop } from './components/ScrollToTop'
import { AuthProvider } from './features/auth/AuthContext'
import { SiteHeader } from './components/layout/SiteHeader'
import { SiteFooter } from './components/layout/SiteFooter'
import { PrivacyPage } from './features/legal/PrivacyPage'
import { TermsPage } from './features/legal/TermsPage'
import { AboutPage } from './features/marketing/AboutPage'
import { ContactPage } from './features/marketing/ContactPage'
import { ExplorePage } from './features/search/ExplorePage'
import { NotFoundPage } from './features/marketing/NotFoundPage'
import { LoginPage } from './features/auth/LoginPage'
import { RegisterPage } from './features/auth/RegisterPage'
import { MyTripsPage } from './features/auth/MyTripsPage'
import { SearchScreen } from './themes/chronicle/SearchScreen'
import { TripShell } from './features/trip/TripShell'
import { OverviewPage } from './features/trip/pages/OverviewPage'
import { TripPlanPage } from './features/trip/pages/TripPlanPage'
import { WeatherPage } from './features/trip/pages/WeatherPage'
import { PhrasebookPage } from './features/trip/pages/PhrasebookPage'
import './styles/theme.css'
import './themes/chronicle/chronicle.css'

/**
 * Wraps a page in the shared site chrome (sticky header + footer).
 *
 * The trip experience keeps its own full-bleed chrome, so it opts out rather
 * than being wrapped here — a second header above the trip nav would eat a
 * third of a phone screen.
 */
function WithChrome({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <SiteHeader />
      <div className="flex-1">{children}</div>
      <SiteFooter />
    </div>
  )
}

/**
 * The trip UI renders inside the app shell but without the marketing header,
 * because it has its own navigation and needs the vertical space.
 */
function TripChrome({ children }: { children: ReactNode }) {
  const location = useLocation()
  // Remember the most recent trip so registering can claim it into the new
  // account instead of losing the trip that prompted the signup.
  const match = /^\/trip\/([^/]+)/.exec(location.pathname)
  if (match) {
    try {
      sessionStorage.setItem('trip-one:last-trip', match[1])
    } catch {
      // Private browsing can refuse sessionStorage; claiming is a nicety.
    }
  }
  return <>{children}</>
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ScrollToTop />
        <Routes>
          <Route
            path="/"
            element={
              <WithChrome>
                <ErrorBoundary label="Search">
                  <SearchScreen />
                </ErrorBoundary>
              </WithChrome>
            }
          />

          <Route
            path="/trip/:id"
            element={
              <TripChrome>
                <ErrorBoundary label="Trip">
                  <TripShell />
                </ErrorBoundary>
              </TripChrome>
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

          {[
            { path: '/explore', element: <ExplorePage /> },
            { path: '/about', element: <AboutPage /> },
            { path: '/contact', element: <ContactPage /> },
            { path: '/privacy', element: <PrivacyPage /> },
            { path: '/terms', element: <TermsPage /> },
            { path: '/login', element: <LoginPage /> },
            { path: '/register', element: <RegisterPage /> },
            { path: '/my-trips', element: <MyTripsPage /> },
            { path: '*', element: <NotFoundPage /> },
          ].map(({ path, element }) => (
            <Route
              key={path}
              path={path}
              element={
                <WithChrome>
                  <ErrorBoundary label="Page">{element}</ErrorBoundary>
                </WithChrome>
              }
            />
          ))}
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
