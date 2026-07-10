import type { DailyForecast } from '../../weather/useDailyForecast'
import { wmoEmoji } from '../../weather/useForecast'

/** A real hourly-forecast link for a place and date (Google weather, works globally). */
function hourlyUrl(displayName: string, date: string): string {
  const when = new Date(`${date}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  return `https://www.google.com/search?q=${encodeURIComponent(`hourly weather ${displayName} ${when}`)}`
}

/**
 * The daily forecast as a card grid — one card per day with the weather emoji,
 * conditions, hi/lo, precip, and a per-day "Hourly →" link to a real hourly
 * forecast, matching the yellowstone-one pattern.
 */
export function ForecastStrip({ days, displayName }: { days: DailyForecast[]; displayName: string }) {
  if (days.length === 0) return null
  return (
    <div className="chronicle-forecast-grid">
      {days.map((day) => (
        <a
          key={day.date}
          className="chronicle-forecast-day"
          href={hourlyUrl(displayName, day.date)}
          target="_blank"
          rel="noopener noreferrer"
          title={`Hourly forecast for ${new Date(`${day.date}T00:00:00`).toLocaleDateString(undefined, { weekday: 'long' })}`}
        >
          <span className="chronicle-forecast-date">
            {new Date(`${day.date}T00:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
          </span>
          <span className="chronicle-forecast-emoji" aria-hidden="true">
            {wmoEmoji(day.code ?? -1)}
          </span>
          <span className="chronicle-forecast-condition">{day.condition}</span>
          <span className="chronicle-forecast-temps">
            {Math.round(day.hiF)}° / {Math.round(day.loF)}°
          </span>
          {day.precipPercent != null && <span className="chronicle-forecast-precip">{day.precipPercent}% precip</span>}
          <span className="chronicle-forecast-hourly">Hourly →</span>
        </a>
      ))}
    </div>
  )
}
