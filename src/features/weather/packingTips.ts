import type { DailyForecast } from './useDailyForecast'

const RAIN_PRECIP_THRESHOLD = 40
const COLD_LOW_THRESHOLD_F = 50
const HOT_HIGH_THRESHOLD_F = 85
const SUN_HIGH_THRESHOLD_F = 80

/**
 * Derives real, forecast-backed packing suggestions — never invented advice,
 * only conclusions drawn directly from the numbers Open-Meteo returned for
 * this specific trip's days.
 * @param days - The daily forecast entries for the trip
 * @returns Plain-language tips, or an empty array if nothing stands out
 */
export function packingTips(days: DailyForecast[]): string[] {
  const tips: string[] = []
  if (days.length === 0) return tips

  const anyRain = days.some((d) => d.precipPercent != null && d.precipPercent >= RAIN_PRECIP_THRESHOLD)
  if (anyRain) tips.push('Pack a rain layer — some days have a high chance of precipitation.')

  const anyCold = days.some((d) => d.loF < COLD_LOW_THRESHOLD_F)
  if (anyCold) tips.push('Pack warm layers — overnight lows drop below 50°F.')

  const anyHot = days.some((d) => d.hiF >= HOT_HIGH_THRESHOLD_F)
  if (anyHot) tips.push('Pack light, breathable clothing — daytime highs top 85°F.')

  const allSunnyAndWarm = days.every(
    (d) => d.hiF >= SUN_HIGH_THRESHOLD_F && (d.precipPercent == null || d.precipPercent < RAIN_PRECIP_THRESHOLD),
  )
  if (allSunnyAndWarm) tips.push('Pack sun protection — every day is forecast warm and dry.')

  return tips
}
