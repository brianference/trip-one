import { useTripContext } from '../useTripContext'
import { useTripStore } from '../../../store/tripStore'
import { useForecast } from '../../weather/useForecast'
import { useDailyForecast } from '../../weather/useDailyForecast'
import { useHourlyForecast } from '../../weather/useHourlyForecast'
import { packingTips } from '../../weather/packingTips'
import { WeatherNow } from '../components/WeatherNow'
import { ForecastStrip } from '../components/ForecastStrip'
import { HourlyForecast } from '../components/HourlyForecast'
import { PackingTips } from '../components/PackingTips'
import { LocalInfoCard } from '../components/LocalInfoCard'

// Show a full week by default, or the trip length if longer, capped at
// Open-Meteo's reliable 14-day window (it returns up to 16).
const MIN_FORECAST_DAYS = 7
const MAX_FORECAST_DAYS = 14

/**
 * The trip's Weather page — the full-featured version of the weather snippet
 * on Home. Current conditions, a multi-day forecast, and forecast-derived
 * packing tips (all real Open-Meteo data), plus a compact local-info section
 * (currency, phrasebook, transit) so the still-useful bits of the old Info
 * page aren't lost. This replaces the thin "Info" page in the nav.
 */
export function WeatherPage() {
  const { trip, location } = useTripContext()
  const tripLengthDays = useTripStore((s) => s.tripLengthDays)
  const displayName = location?.displayName ?? trip.locationSlug

  const forecastDays = Math.min(Math.max(tripLengthDays ?? MIN_FORECAST_DAYS, MIN_FORECAST_DAYS), MAX_FORECAST_DAYS)
  const { data: forecast, loading: nowLoading } = useForecast(location?.lat ?? 0, location?.lng ?? 0)
  const { data: hourly } = useHourlyForecast(location?.lat ?? 0, location?.lng ?? 0, 12)
  const { data: dailyForecast, loading: dailyLoading } = useDailyForecast(location?.lat ?? 0, location?.lng ?? 0, forecastDays)
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

      {hourly && hourly.length > 0 && (
        <section aria-label="Hourly forecast">
          <h2 className="chronicle-weather-section-heading">Next 12 hours</h2>
          <HourlyForecast hours={hourly} />
        </section>
      )}

      <section aria-label="Forecast">
        <h2 className="chronicle-weather-section-heading">Next {forecastDays} days</h2>
        {dailyLoading && !dailyForecast ? (
          <p className="chronicle-rate-line">Loading forecast…</p>
        ) : dailyForecast && dailyForecast.length > 0 ? (
          <ForecastStrip days={dailyForecast} />
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
