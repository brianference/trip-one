import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useCurrencyRate } from './useCurrencyRate'

describe('useCurrencyRate', () => {
  afterEach(() => vi.restoreAllMocks())

  it('returns the rate for the target currency', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ rates: { EUR: 0.92 } }) }))
    const { result } = renderHook(() => useCurrencyRate('EUR'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.rate).toBe(0.92)
  })

  it('returns null on failure instead of throwing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    const { result } = renderHook(() => useCurrencyRate('EUR'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.rate).toBeNull()
  })

  it('short-circuits to a rate of 1 for USD without calling fetch', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const { result } = renderHook(() => useCurrencyRate('USD'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.rate).toBe(1)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
