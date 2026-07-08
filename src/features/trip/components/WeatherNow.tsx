import type { Forecast } from '../../weather/useForecast'

/** Current temperature + condition line, shown on Overview and Weather sections. */
export function WeatherNow({ forecast }: { forecast: Forecast | null }) {
  if (!forecast) return null
  return (
    <p className="chronicle-weather">
      {forecast.temperatureF}°F <span className="chronicle-weather-condition">— {forecast.condition}</span>
    </p>
  )
}
