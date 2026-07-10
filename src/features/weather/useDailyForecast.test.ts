import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useDailyForecast } from './useDailyForecast'

describe('useDailyForecast', () => {
  afterEach(() => vi.restoreAllMocks())

  it('parses a multi-day response into one entry per day', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          daily: {
            time: ['2026-07-10', '2026-07-11'],
            temperature_2m_max: [75, 80],
            temperature_2m_min: [55, 58],
            weather_code: [3, 61],
            precipitation_probability_max: [20, 70],
          },
        }),
      }),
    )
    const { result } = renderHook(() => useDailyForecast(53.35, -6.26, 2))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.data).toEqual([
      { date: '2026-07-10', hiF: 75, loF: 55, condition: 'Overcast', code: 3, precipPercent: 20 },
      { date: '2026-07-11', hiF: 80, loF: 58, condition: 'Rain', code: 61, precipPercent: 70 },
    ])
  })

  it('requests forecast_days matching the given day count', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        daily: { time: [], temperature_2m_max: [], temperature_2m_min: [], weather_code: [], precipitation_probability_max: [] },
      }),
    })
    vi.stubGlobal('fetch', fetchMock)
    renderHook(() => useDailyForecast(53.35, -6.26, 5))
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('forecast_days=5'))
  })

  it('clamps the requested day count to Open-Meteo max of 16', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        daily: { time: [], temperature_2m_max: [], temperature_2m_min: [], weather_code: [], precipitation_probability_max: [] },
      }),
    })
    vi.stubGlobal('fetch', fetchMock)
    renderHook(() => useDailyForecast(53.35, -6.26, 60))
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('forecast_days=16'))
  })

  it('returns null data instead of throwing when the fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    const { result } = renderHook(() => useDailyForecast(53.35, -6.26, 3))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.data).toBeNull()
  })
})
