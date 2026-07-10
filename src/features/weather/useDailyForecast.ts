import { useEffect, useState } from 'react'
import { logger } from '../../lib/logger'
import { WMO_CONDITIONS } from './useForecast'

export interface DailyForecast {
  date: string
  hiF: number
  loF: number
  condition: string
  /** Raw WMO weather code, used to pick the day's emoji (optional; display-only). */
  code?: number
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
export function useDailyForecast(lat: number, lng: number, days: number, startDate?: string) {
  const [data, setData] = useState<DailyForecast[] | null>(null)
  const [loading, setLoading] = useState(true)
  const clampedDays = Math.min(Math.max(days, 1), 16)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    // When an in-range trip start date is given, request exactly those days
    // (start_date..end_date); otherwise the next N days from now.
    let range = `forecast_days=${clampedDays}`
    if (startDate) {
      const end = new Date(`${startDate}T00:00:00`)
      end.setDate(end.getDate() + clampedDays - 1)
      const endStr = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`
      range = `start_date=${startDate}&end_date=${endStr}`
    }
    fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&daily=temperature_2m_max,temperature_2m_min,weather_code,precipitation_probability_max&temperature_unit=fahrenheit&${range}`,
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
          code: daily.weather_code[i] ?? -1,
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
  }, [lat, lng, clampedDays, startDate])

  return { data, loading }
}
