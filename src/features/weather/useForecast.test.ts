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
        json: async () => ({ current: { temperature_2m: 14.2, weather_code: 3 } }),
      }),
    )
    const { result } = renderHook(() => useForecast(53.35, -6.26))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.data).toEqual({ temperatureC: 14.2, condition: 'Overcast', isFallback: false })
  })

  it('falls back to a seasonal estimate when the fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    const { result } = renderHook(() => useForecast(53.35, -6.26))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.data?.isFallback).toBe(true)
    expect(result.current.error).toBeNull()
  })
})
