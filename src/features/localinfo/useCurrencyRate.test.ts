import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useCurrencyRate } from './useCurrencyRate'

describe('useCurrencyRate', () => {
  afterEach(() => vi.restoreAllMocks())

  it('returns the rate and updated-at time for the target currency', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ rate: 0.92, updatedAt: 'Tue, 29 Sep 2026 00:02:31 +0000' }) })
    vi.stubGlobal('fetch', fetchMock)
    const { result } = renderHook(() => useCurrencyRate('EUR'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.rate).toBe(0.92)
    expect(result.current.updatedAt).toBe('Tue, 29 Sep 2026 00:02:31 +0000')
    // Calls this app's own proxy, never the upstream open.er-api.com directly.
    expect(fetchMock).toHaveBeenCalledWith('/api/currency?to=EUR')
  })

  it('shares one in-flight request across two hooks mounted for the same code', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ rate: 0.92, updatedAt: null }) })
    vi.stubGlobal('fetch', fetchMock)
    const first = renderHook(() => useCurrencyRate('EUR'))
    const second = renderHook(() => useCurrencyRate('EUR'))
    await waitFor(() => expect(first.result.current.loading).toBe(false))
    await waitFor(() => expect(second.result.current.loading).toBe(false))
    expect(first.result.current.rate).toBe(0.92)
    expect(second.result.current.rate).toBe(0.92)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('returns null on failure instead of throwing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    const { result } = renderHook(() => useCurrencyRate('EUR'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.rate).toBeNull()
  })

  it('resolves an unknown (null) currency to no rate without calling fetch', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const { result } = renderHook(() => useCurrencyRate(null))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.rate).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
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
