import type { HourlyPoint } from '../../weather/useHourlyForecast'

function formatHour(time: string): string {
  try {
    return new Date(time).toLocaleTimeString([], { hour: 'numeric' })
  } catch {
    return time.slice(11, 16)
  }
}

/** A horizontally-scrolling strip of the next real hourly forecast points. */
export function HourlyForecast({ hours }: { hours: HourlyPoint[] }) {
  if (hours.length === 0) return null
  return (
    <ul className="chronicle-hourly-strip">
      {hours.map((h) => (
        <li key={h.time} className="chronicle-hourly-hour">
          <span className="chronicle-hourly-time">{formatHour(h.time)}</span>
          <span className="chronicle-hourly-temp">{Math.round(h.tempF)}°</span>
          <span className="chronicle-hourly-condition">{h.condition}</span>
          {h.precipPercent != null && h.precipPercent > 0 && <span className="chronicle-hourly-precip">{h.precipPercent}%</span>}
        </li>
      ))}
    </ul>
  )
}
