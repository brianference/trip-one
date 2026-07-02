import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useForecast } from './useForecast'

describe('useForecast', () => {
  afterEach(() => vi.restoreAllMocks())

  it('returns parsed current weather on success', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ current: { temperature_2m: 57.6, weather_code: 3 } }),
      }),
    )
    const { result } = renderHook(() => useForecast(53.35, -6.26))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.data).toEqual({ temperatureF: 57.6, condition: 'Overcast', isFallback: false })
  })

  it('requests Fahrenheit units from the Open-Meteo API', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ current: { temperature_2m: 57.6, weather_code: 3 } }),
    })
    vi.stubGlobal('fetch', fetchMock)
    const { result } = renderHook(() => useForecast(53.35, -6.26))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('temperature_unit=fahrenheit'))
  })

  it('falls back to a seasonal estimate when the fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    const { result } = renderHook(() => useForecast(53.35, -6.26))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.data?.isFallback).toBe(true)
    expect(result.current.error).toBeNull()
  })

  it('falls back to a seasonal estimate when the response is not ok', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        json: async () => ({ reason: 'rate limited' }),
      }),
    )
    const { result } = renderHook(() => useForecast(53.35, -6.26))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.data?.isFallback).toBe(true)
    expect(result.current.error).toBeNull()
  })

  it('resolves previously-unmapped WMO codes to real labels', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ current: { temperature_2m: 50, weather_code: 45 } }),
      }),
    )
    const { result } = renderHook(() => useForecast(53.35, -6.26))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.data).toEqual({ temperatureF: 50, condition: 'Fog', isFallback: false })
  })

  it('resolves rain-shower WMO codes to real labels', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ current: { temperature_2m: 60.8, weather_code: 80 } }),
      }),
    )
    const { result } = renderHook(() => useForecast(53.35, -6.26))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.data).toEqual({ temperatureF: 60.8, condition: 'Rain showers', isFallback: false })
  })
})
