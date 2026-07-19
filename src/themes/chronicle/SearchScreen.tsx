import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { fetchLocation, createTrip, updateTrip, fetchAutocomplete } from '../../lib/api/client'
import { useTripStore } from '../../store/tripStore'
import { logger } from '../../lib/logger'
import { DEMO_TRIPS } from '../../lib/api/demoIds'
import { buildStarterItinerary } from '../../lib/itinerary/buildStarterItinerary'
import { HomeAiPlanner } from '../../features/trip/components/HomeAiPlanner'
import { TripBuildingOverlay } from '../../features/trip/components/TripBuildingOverlay'
import { getRecentTrips } from '../../features/trip/recentTrips'
import { SearchBox, type Suggestion } from '../../features/search/SearchBox'
import { Seo, SITE_URL } from '../../components/Seo'

const FEATURES = [
  {
    title: 'Grounded AI',
    description:
      'Describe your trip in a sentence and get a real day-by-day plan — every stop a real place, never invented.',
  },
  {
    title: 'Day plan + map',
    description: 'One Plan page: the map, each day’s stops, and nearby places to add — toggle days to see the route.',
  },
  {
    title: 'Real weather',
    description:
      'Current conditions and a 5-day forecast, each day linking to its hourly forecast, plus packing tips.',
  },
  {
    title: 'Refine by chat',
    description:
      'Ask the assistant to add food, relax a day, or change destination — it re-plans from real places.',
  },
]

/** Section label above a heading. */
function Kicker({ children }: { children: string }) {
  return <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--accent-text)]">{children}</p>
}

/**
 * Landing page — the site's front door.
 *
 * Search is the shared {@link SearchBox} rather than a second combobox: this
 * screen used to carry its own debounce, click-outside and suggestion-list
 * implementation, which meant two search experiences to keep in step and only
 * one of them had keyboard navigation.
 */
export function SearchScreen() {
  const [busy, setBusy] = useState(false)
  const [buildStatus, setBuildStatus] = useState('')
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const setTrip = useTripStore((s) => s.setTrip)
  // Trips opened before on this device — a "continue" list that works signed out.
  const [recentTrips] = useState(() => getRecentTrips())

  const submitLocation = useCallback(
    async (locationQuery: string) => {
      // Guard a blank query and overlapping submissions: either previously hit
      // the API with an invalid or duplicate query and left a stale error
      // banner that a later valid query never cleared.
      if (!locationQuery.trim() || busy) return
      setBusy(true)
      setError(null)
      try {
        setBuildStatus(`Finding real places in ${locationQuery.trim()}…`)
        const location = await fetchLocation(locationQuery)
        const trip = await createTrip(location.slug, 'chronicle')
        setBuildStatus('Planning your first days…')
        const starter = buildStarterItinerary(location.thingsToDo)
        const updated = starter.length > 0 ? await updateTrip(trip.id, { itinerary: starter }) : trip
        setTrip(updated.id, updated.locationSlug, updated.itinerary, updated.designStyle)
        navigate(`/trip/${updated.id}`)
      } catch (err) {
        logger.error('failed to create trip from search', err)
        setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
      } finally {
        setBusy(false)
        setBuildStatus('')
      }
    },
    [busy, navigate, setTrip],
  )

  // Arriving from /explore with ?destination=… should start that trip straight
  // away, so the search on Explore leads somewhere instead of just prefilling.
  useEffect(() => {
    const destination = params.get('destination')
    if (destination) void submitLocation(destination)
    // Intentionally runs only on the first render for a given destination.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.get('destination')])

  const fetchSuggestions = useCallback(async (q: string): Promise<Suggestion[]> => {
    const results = await fetchAutocomplete(q)
    return results.map((r) => {
      const parts = r.displayName.split(',').map((p) => p.trim())
      return { label: parts[0], context: parts.length > 1 ? parts[parts.length - 1] : undefined, full: r.displayName }
    })
  }, [])

  return (
    <main id="main">
      <Seo
        title="Trip One"
        description="Describe a trip in one sentence and Trip One builds a real, day-by-day itinerary from verified places — then refine it by chatting."
        path="/"
        jsonLd={{
          '@context': 'https://schema.org',
          '@type': 'WebApplication',
          name: 'Trip One',
          url: SITE_URL,
          applicationCategory: 'TravelApplication',
          offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
        }}
      />
      {busy && <TripBuildingOverlay status={buildStatus} />}

      <section className="mx-auto max-w-6xl px-4 pb-8 pt-10 sm:px-6 sm:pt-16">
        <div className="mx-auto max-w-2xl text-center">
          <Kicker>A trip planner, without the friction</Kicker>
          {/* text-balance keeps the sentence from breaking after "trip." on
              mid-width screens; the size steps down on small phones so it stays
              on one line rather than wrapping mid-thought. */}
          <h1 className="mt-3 text-pretty font-[family-name:var(--font-display)] text-[1.75rem] font-semibold leading-[1.15] tracking-tight text-balance sm:text-4xl lg:text-5xl">
            Describe your trip. We build it.
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-lg leading-relaxed opacity-80">
            Tell us where you want to go and what you’re after — we turn one sentence into a real day-by-day itinerary
            made from actual places there.
          </p>
        </div>

        <div className="mt-10 grid gap-8 lg:grid-cols-[1.15fr_1fr] lg:items-start">
          <div className="rounded-[var(--radius-card)] border border-[var(--hairline)] bg-[var(--surface)] p-5 shadow-[var(--shadow-card)] sm:p-6">
            <HomeAiPlanner />
          </div>

          <div className="space-y-6">
            <div>
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider opacity-60">
                Or just browse a place
              </h2>
              <SearchBox
                fetchSuggestions={fetchSuggestions}
                placeholder="Yellowstone, Tokyo, Reykjavik…"
                onSubmit={(q) => void submitLocation(q)}
              />
              {error && (
                <p role="alert" className="mt-2 text-sm text-danger-500">
                  {error}
                </p>
              )}
            </div>

            <div>
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider opacity-60">
                Or start from a ready trip
              </h2>
              <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
                {DEMO_TRIPS.map((trip) => (
                  <li key={trip.id}>
                    <Link
                      to={`/trip/${trip.id}`}
                      className="flex flex-col gap-0.5 rounded-xl border border-[var(--hairline)] bg-[var(--surface)] px-4 py-3 transition-colors hover:border-[var(--color-primary)] hover:bg-[var(--surface-muted)]"
                    >
                      <span className="font-medium">{trip.city}</span>
                      <span className="text-sm opacity-70">{trip.blurb}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {recentTrips.length > 0 && (
        <section className="mx-auto max-w-6xl px-4 py-10 sm:px-6" aria-labelledby="recents-heading">
          <Kicker>Continue</Kicker>
          <h2
            id="recents-heading"
            className="mt-2 font-[family-name:var(--font-display)] text-2xl font-semibold tracking-tight"
          >
            Pick up where you left off.
          </h2>
          <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {recentTrips.map((t) => (
              <li key={t.id}>
                <Link
                  to={`/trip/${t.id}`}
                  className="flex flex-col gap-0.5 rounded-xl border border-[var(--hairline)] bg-[var(--surface)] px-4 py-3 transition-colors hover:border-[var(--color-primary)] hover:bg-[var(--surface-muted)]"
                >
                  <span className="font-medium">{t.name}</span>
                  <span className="text-sm opacity-70">Open your trip →</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6" aria-labelledby="features-heading">
        <Kicker>What you get</Kicker>
        <h2
          id="features-heading"
          className="mt-2 font-[family-name:var(--font-display)] text-2xl font-semibold tracking-tight sm:text-3xl"
        >
          Four things, done well.
        </h2>
        <p className="mt-2 max-w-2xl opacity-75">
          Every stop is a real place from Google and Tripadvisor — never invented. You can plan a full trip without an
          account.
        </p>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((feature) => (
            <div
              key={feature.title}
              className="rounded-[var(--radius-card)] border border-[var(--hairline)] bg-[var(--surface)] p-5 shadow-[var(--shadow-card)]"
            >
              <h3 className="font-[family-name:var(--font-display)] text-lg font-semibold">{feature.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed opacity-75">{feature.description}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  )
}
