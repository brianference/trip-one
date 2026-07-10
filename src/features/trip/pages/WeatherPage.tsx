import { useTripContext } from '../useTripContext'
import { useTripStore } from '../../../store/tripStore'
import { useForecast } from '../../weather/useForecast'
import { useDailyForecast } from '../../weather/useDailyForecast'
import { packingTips } from '../../weather/packingTips'
import { WeatherNow } from '../components/WeatherNow'
import { ForecastStrip } from '../components/ForecastStrip'
import { PackingTips } from '../components/PackingTips'
import { LocalInfoCard } from '../components/LocalInfoCard'

// A 5-day forecast, each day linking to its own hourly forecast — the
// yellowstone-one pattern.
const FORECAST_DAYS = 5

/**
 * The trip's Weather page: current conditions, a 5-day forecast (each day links
 * to a real hourly forecast), forecast-derived packing tips, and a compact
 * local-info section (currency + transit). All real Open-Meteo data.
 */
/** Open-Meteo's daily forecast reliably covers about the next 16 days. */
function isWithinForecastWindow(startDate: string): boolean {
  const start = new Date(`${startDate}T00:00:00`)
  if (Number.isNaN(start.getTime())) return false
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const daysOut = (start.getTime() - today.getTime()) / (24 * 60 * 60 * 1000)
  return daysOut >= 0 && daysOut <= 15
}

export function WeatherPage() {
  const { trip, location } = useTripContext()
  const displayName = location?.displayName ?? trip.locationSlug
  const startDate = useTripStore((s) => s.startDate)

  // Align the forecast to the trip's dates when they're set and within the
  // forecast window; otherwise show the next 5 days (and say so honestly).
  const aligned = startDate ? isWithinForecastWindow(startDate) : false
  const { data: forecast, loading: nowLoading } = useForecast(location?.lat ?? 0, location?.lng ?? 0)
  const { data: dailyForecast, loading: dailyLoading } = useDailyForecast(
    location?.lat ?? 0,
    location?.lng ?? 0,
    FORECAST_DAYS,
    aligned ? startDate! : undefined,
  )
  const tips = dailyForecast ? packingTips(dailyForecast) : []

  return (
    <article className="chronicle-chapter">
      <h1>Weather in {displayName}</h1>

      <section className="chronicle-weather-current" aria-label="Current conditions">
        {nowLoading && !forecast ? <p className="chronicle-rate-line">Loading current conditions…</p> : <WeatherNow forecast={forecast} />}
        {forecast?.isFallback && (
          <p className="chronicle-weather-fallback">Live data is unavailable right now, so this is a seasonal estimate.</p>
        )}
      </section>

      <section aria-label="Forecast">
        <h2 className="chronicle-weather-section-heading">{aligned ? 'Forecast for your dates' : `Next ${FORECAST_DAYS} days`}</h2>
        {startDate && !aligned && (
          <p className="chronicle-weather-fallback">Your trip dates are outside the 16-day forecast window — showing the next {FORECAST_DAYS} days.</p>
        )}
        {dailyLoading && !dailyForecast ? (
          <p className="chronicle-rate-line">Loading forecast…</p>
        ) : dailyForecast && dailyForecast.length > 0 ? (
          <ForecastStrip days={dailyForecast} displayName={displayName} />
        ) : (
          <p className="chronicle-rate-line">Forecast unavailable right now.</p>
        )}
      </section>

      {tips.length > 0 && <PackingTips tips={tips} />}

      <section className="chronicle-weather-localinfo" aria-label="Local info">
        <h2 className="chronicle-weather-section-heading">Local info</h2>
        <LocalInfoCard displayName={displayName} />
      </section>
    </article>
  )
}
