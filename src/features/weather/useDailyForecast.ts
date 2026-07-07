import { useEffect, useState } from 'react'
import { logger } from '../../lib/logger'
import { WMO_CONDITIONS } from './useForecast'

export interface DailyForecast {
  date: string
  hiF: number
  loF: number
  condition: string
  precipPercent: number | null
}

/**
 * Fetches a real multi-day forecast from Open-Meteo (the same free, no-key
 * provider already used for current conditions) for the map/itinerary
 * section's day strip. Days beyond what Open-Meteo returns (max 16) are
 * simply omitted rather than fabricated.
 * @param lat - Latitude of the trip location
 * @param lng - Longitude of the trip location
 * @param days - Number of days to request (clamped to Open-Meteo's 1-16 range)
 */
export function useDailyForecast(lat: number, lng: number, days: number) {
  const [data, setData] = useState<DailyForecast[] | null>(null)
  const [loading, setLoading] = useState(true)
  const clampedDays = Math.min(Math.max(days, 1), 16)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&daily=temperature_2m_max,temperature_2m_min,weather_code,precipitation_probability_max&temperature_unit=fahrenheit&forecast_days=${clampedDays}`,
    )
      .then((res) => {
        if (!res.ok) throw new Error(`Open-Meteo daily request failed: ${res.status}`)
        return res.json()
      })
      .then((body) => {
        if (cancelled) return
        const daily = body.daily
        const parsed: DailyForecast[] = daily.time.map((date: string, i: number) => ({
          date,
          hiF: daily.temperature_2m_max[i],
          loF: daily.temperature_2m_min[i],
          condition: WMO_CONDITIONS[daily.weather_code[i]] ?? 'Unknown',
          precipPercent: daily.precipitation_probability_max?.[i] ?? null,
        }))
        setData(parsed)
        setLoading(false)
      })
      .catch((err) => {
        if (cancelled) return
        logger.warn('daily forecast fetch failed', { error: String(err) })
        setData(null)
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [lat, lng, clampedDays])

  return { data, loading }
}
