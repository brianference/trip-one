import { useEffect, useState } from 'react'
import { logger } from '../../lib/logger'
import { WMO_CONDITIONS } from './useForecast'

export interface HourlyPoint {
  /** ISO local time string from Open-Meteo, e.g. "2026-07-09T15:00". */
  time: string
  tempF: number
  condition: string
  precipPercent: number | null
}

/**
 * Fetches a real hour-by-hour forecast from Open-Meteo (the same free, no-key
 * provider used elsewhere) and returns the next `hours` hours from now. Hours
 * already past today are filtered out; nothing is fabricated.
 * @param lat - Latitude of the trip location
 * @param lng - Longitude of the trip location
 * @param hours - How many upcoming hours to return (default 12)
 */
export function useHourlyForecast(lat: number, lng: number, hours = 12) {
  const [data, setData] = useState<HourlyPoint[] | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&hourly=temperature_2m,weather_code,precipitation_probability&temperature_unit=fahrenheit&forecast_days=2`,
    )
      .then((res) => {
        if (!res.ok) throw new Error(`Open-Meteo hourly request failed: ${res.status}`)
        return res.json()
      })
      .then((body) => {
        if (cancelled) return
        const h = body.hourly
        const now = Date.now()
        const all: HourlyPoint[] = h.time.map((time: string, i: number) => ({
          time,
          tempF: h.temperature_2m[i],
          condition: WMO_CONDITIONS[h.weather_code[i]] ?? 'Unknown',
          precipPercent: h.precipitation_probability?.[i] ?? null,
        }))
        // Keep only upcoming hours (drop ones already past today), then take `hours`.
        const upcoming = all.filter((p) => new Date(`${p.time}`).getTime() >= now - 60 * 60 * 1000).slice(0, hours)
        setData(upcoming)
        setLoading(false)
      })
      .catch((err) => {
        if (cancelled) return
        logger.warn('hourly forecast fetch failed', { error: String(err) })
        setData(null)
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [lat, lng, hours])

  return { data, loading }
}
