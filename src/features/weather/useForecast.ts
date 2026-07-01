import { useEffect, useState } from 'react'
import { logger } from '../../lib/logger'

export interface Forecast {
  temperatureC: number
  condition: string
  isFallback: boolean
}

const WMO_CONDITIONS: Record<number, string> = {
  0: 'Clear',
  1: 'Mostly clear',
  2: 'Partly cloudy',
  3: 'Overcast',
  61: 'Rain',
  71: 'Snow',
  95: 'Thunderstorm',
}

function seasonalFallback(): Forecast {
  const month = new Date().getMonth()
  const isSummer = month >= 4 && month <= 8
  return { temperatureC: isSummer ? 22 : 8, condition: isSummer ? 'Mild (estimate)' : 'Cool (estimate)', isFallback: true }
}

export function useForecast(lat: number, lng: number) {
  const [data, setData] = useState<Forecast | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,weather_code`)
      .then((res) => res.json())
      .then((body) => {
        if (cancelled) return
        setData({
          temperatureC: body.current.temperature_2m,
          condition: WMO_CONDITIONS[body.current.weather_code] ?? 'Unknown',
          isFallback: false,
        })
        setLoading(false)
      })
      .catch((err) => {
        if (cancelled) return
        logger.warn('weather fetch failed, using seasonal fallback', { error: String(err) })
        setData(seasonalFallback())
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [lat, lng])

  return { data, error, loading }
}
