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
  45: 'Fog',
  48: 'Rime fog',
  51: 'Light drizzle',
  53: 'Moderate drizzle',
  55: 'Dense drizzle',
  56: 'Light freezing drizzle',
  57: 'Dense freezing drizzle',
  61: 'Rain',
  63: 'Moderate rain',
  65: 'Heavy rain',
  66: 'Light freezing rain',
  67: 'Heavy freezing rain',
  71: 'Snow',
  73: 'Moderate snow',
  75: 'Heavy snow',
  77: 'Snow grains',
  80: 'Rain showers',
  81: 'Moderate rain showers',
  82: 'Violent rain showers',
  85: 'Snow showers',
  86: 'Heavy snow showers',
  95: 'Thunderstorm',
  96: 'Thunderstorm with hail',
  99: 'Thunderstorm with heavy hail',
}

function seasonalFallback(): Forecast {
  const month = new Date().getMonth()
  const isSummer = month >= 4 && month <= 8
  return { temperatureC: isSummer ? 22 : 8, condition: isSummer ? 'Mild (estimate)' : 'Cool (estimate)', isFallback: true }
}

export function useForecast(lat: number, lng: number) {
  const [data, setData] = useState<Forecast | null>(null)
  const [error] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,weather_code`)
      .then((res) => {
        if (!res.ok) throw new Error(`Open-Meteo request failed: ${res.status}`)
        return res.json()
      })
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
