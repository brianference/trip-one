import type { DailyForecast } from '../../weather/useDailyForecast'

/** A horizontally-scrolling strip of real daily forecast cards. */
export function ForecastStrip({ days }: { days: DailyForecast[] }) {
  if (days.length === 0) return null
  return (
    <ul className="chronicle-forecast-strip">
      {days.map((day) => (
        <li key={day.date} className="chronicle-forecast-day">
          <span className="chronicle-forecast-date">
            {new Date(`${day.date}T00:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
          </span>
          <span className="chronicle-forecast-condition">{day.condition}</span>
          <span className="chronicle-forecast-temps">
            {Math.round(day.hiF)}° / {Math.round(day.loF)}°
          </span>
          {day.precipPercent != null && <span className="chronicle-forecast-precip">{day.precipPercent}% precip</span>}
        </li>
      ))}
    </ul>
  )
}
