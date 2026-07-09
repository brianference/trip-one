import { useNavigate } from 'react-router-dom'
import type { PlanDay } from '../../../lib/api/client'
import { useTripContext } from '../useTripContext'
import { useTripStore } from '../../../store/tripStore'
import { useItineraryActions } from '../hooks/useItineraryActions'
import { useForecast } from '../../weather/useForecast'
import { useDailyForecast } from '../../weather/useDailyForecast'
import { packingTips } from '../../weather/packingTips'
import { AiPlanner } from '../components/AiPlanner'
import { WeatherNow } from '../components/WeatherNow'
import { ForecastStrip } from '../components/ForecastStrip'
import { PackingTips } from '../components/PackingTips'
import { LocalInfoCard } from '../components/LocalInfoCard'
import { PreviewCard } from '../components/PreviewCard'
import { TripMap } from '../components/TripMap'

const DEFAULT_FORECAST_DAYS = 5
const NEXT_UP_COUNT = 3
const NEARBY_PREVIEW_COUNT = 3

/**
 * The trip's home dashboard: real weather, a preview of the next few
 * itinerary stops, a preview of nearby things to do, and a local-info
 * snippet — each with a link into its full page. Every number here is
 * computed from real store/API data; nothing is fabricated (no countdown,
 * since trips have no start date; no curated drive-times or park-pass
 * content, since neither generalizes past one specific real trip).
 */
export function OverviewPage() {
  const { trip, location } = useTripContext()
  const itinerary = useTripStore((s) => s.itinerary)
  const tripLengthDays = useTripStore((s) => s.tripLengthDays)
  const displayName = location?.displayName ?? trip.locationSlug
  const navigate = useNavigate()
  const { applyPlan } = useItineraryActions(trip.id)

  const { data: forecast } = useForecast(location?.lat ?? 0, location?.lng ?? 0)
  const { data: dailyForecast } = useDailyForecast(location?.lat ?? 0, location?.lng ?? 0, tripLengthDays ?? DEFAULT_FORECAST_DAYS)
  const tips = dailyForecast ? packingTips(dailyForecast) : []

  const nextStops = itinerary.slice(0, NEXT_UP_COUNT)
  const nearby = location?.thingsToDo.slice(0, NEARBY_PREVIEW_COUNT) ?? []

  function handleAiPlan(plan: PlanDay[], days: number) {
    applyPlan(plan, location?.thingsToDo ?? [], days)
    navigate(`/trip/${trip.id}/itinerary`)
  }

  return (
    <article className="chronicle-chapter">
      <h1>{displayName}</h1>
      <WeatherNow forecast={forecast} />
      {dailyForecast && dailyForecast.length > 0 && (
        <>
          <ForecastStrip days={dailyForecast} />
          <PackingTips tips={tips} />
        </>
      )}

      {location && <AiPlanner places={location.thingsToDo} defaultDays={tripLengthDays ?? 3} onPlan={handleAiPlan} />}

      <ul className="chronicle-quick-stats">
        <li>
          <strong>{itinerary.length}</strong> stop{itinerary.length === 1 ? '' : 's'} planned
        </li>
        <li>
          <strong>{location?.thingsToDo.length ?? 0}</strong> nearby suggestion{(location?.thingsToDo.length ?? 0) === 1 ? '' : 's'}
        </li>
        {tripLengthDays && (
          <li>
            <strong>{tripLengthDays}</strong>-day trip
          </li>
        )}
      </ul>

      {location && (
        <PreviewCard title="Map" to={`/trip/${trip.id}/map`} linkLabel="Open full map">
          <TripMap location={location} itinerary={itinerary} tripLengthDays={tripLengthDays} height={200} />
        </PreviewCard>
      )}

      {nextStops.length > 0 && (
        <PreviewCard title="Up next" to={`/trip/${trip.id}/itinerary`} linkLabel="See full itinerary">
          <ul className="chronicle-preview-list">
            {nextStops.map((item, i) => (
              <li key={`${item.text}-${i}`}>
                {item.time && <span className="chronicle-preview-time">{item.time}</span>} {item.text}
              </li>
            ))}
          </ul>
        </PreviewCard>
      )}
      {nextStops.length === 0 && (
        <PreviewCard title="Up next" to={`/trip/${trip.id}/itinerary`} linkLabel="Plan your itinerary">
          <p className="chronicle-rate-line">No stops yet.</p>
        </PreviewCard>
      )}

      {nearby.length > 0 && (
        <PreviewCard title="Nearby" to={`/trip/${trip.id}/things-to-do`} linkLabel="Browse all things to do">
          <ul className="chronicle-preview-list">
            {nearby.map((item) => (
              <li key={item.name}>{item.name}</li>
            ))}
          </ul>
        </PreviewCard>
      )}

      <PreviewCard title="Local info" to={`/trip/${trip.id}/local-info`} linkLabel="Full info">
        <LocalInfoCard displayName={displayName} />
      </PreviewCard>
    </article>
  )
}
