import { useEffect, useState } from 'react'
import { logger } from '../../lib/logger'

const FRANKFURTER_BASE_CURRENCY = 'USD'

export interface CurrencyRateState {
  rate: number | null
  loading: boolean
}

/**
 * Fetch the current exchange rate from USD to `targetCurrency` via this
 * app's own `/api/currency` proxy (which in turn calls the free, keyless
 * Frankfurter API server-side — Frankfurter sends no CORS header, so a
 * direct browser fetch is blocked regardless of this app's CSP). Fails
 * soft: any network/parse error, or a currency Frankfurter doesn't
 * recognize, yields `rate: null` rather than throwing, since local info is
 * a non-essential enhancement over the rest of the trip screens.
 * @param targetCurrency - ISO 4217 currency code to convert USD into, e.g. "JPY"
 * @returns The latest rate (or null on failure/unknown currency) and a loading flag
 */
export function useCurrencyRate(targetCurrency: string): CurrencyRateState {
  const [rate, setRate] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setRate(null)

    if (targetCurrency === FRANKFURTER_BASE_CURRENCY) {
      // Frankfurter's API rejects from === to, and the rate is trivially 1.
      setRate(1)
      setLoading(false)
      return
    }

    fetch(`/api/currency?to=${targetCurrency}`)
      .then((res) => res.json())
      .then((body: { rate?: number | null }) => {
        if (cancelled) return
        setRate(body.rate ?? null)
        setLoading(false)
      })
      .catch((err) => {
        if (cancelled) return
        logger.error('currency rate fetch failed', err)
        setRate(null)
        setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [targetCurrency])

  return { rate, loading }
}
