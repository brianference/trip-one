import { useEffect, useState } from 'react'
import { logger } from '../../lib/logger'

/** The rate provider's own base currency — converting it to itself is trivially 1, and this app's `/api/currency` proxy doesn't accept `to=USD`. */
const USD_CURRENCY_CODE = 'USD'

/** The pair the hook actually cares about: the rate itself and when the provider last refreshed it. */
export interface CurrencyRateResult {
  rate: number | null
  updatedAt: string | null
}

export interface CurrencyRateState extends CurrencyRateResult {
  loading: boolean
}

/**
 * In-flight (or just-settled) `/api/currency` requests keyed by currency
 * code, shared at module scope across every `useCurrencyRate` mount. Two
 * components asking for the same code in the same render pass (e.g. the
 * header converter and the Money page) reuse the same promise instead of
 * issuing two identical requests; the entry is removed once the request
 * settles, so a later mount fetches fresh data rather than reusing a stale
 * result forever.
 */
const inFlightRequestsByCode = new Map<string, Promise<CurrencyRateResult>>()

/**
 * Fetch (or reuse an in-flight fetch of) the USD → `targetCurrency` rate
 * from this app's own `/api/currency` proxy, which in turn calls the free
 * open.er-api.com endpoint server-side. Fails soft: any network/parse
 * error, or a currency the provider doesn't recognize, resolves to
 * `{ rate: null, updatedAt: null }` rather than rejecting, since local info
 * is a non-essential enhancement over the rest of the trip screens.
 * @param targetCurrency - ISO 4217 currency code to convert USD into, e.g. "JPY"
 * @returns A promise for the rate (or null) and the provider's last-updated timestamp (or null)
 */
function fetchRate(targetCurrency: string): Promise<CurrencyRateResult> {
  const existing = inFlightRequestsByCode.get(targetCurrency)
  if (existing) return existing

  const request = fetch(`/api/currency?to=${targetCurrency}`)
    .then((res) => res.json())
    .then((body: { rate?: number | null; updatedAt?: string | null }) => ({ rate: body.rate ?? null, updatedAt: body.updatedAt ?? null }))
    .catch((err) => {
      logger.error('currency rate fetch failed', err)
      return { rate: null, updatedAt: null }
    })
    .finally(() => {
      inFlightRequestsByCode.delete(targetCurrency)
    })

  inFlightRequestsByCode.set(targetCurrency, request)
  return request
}

/**
 * Reads the current exchange rate from USD to `targetCurrency`, sharing one
 * in-flight request per code across every component that asks for it at
 * once (see {@link fetchRate}).
 * @param targetCurrency - ISO 4217 currency code to convert USD into, e.g. "JPY"; null when the destination's currency is unknown (no request is made)
 * @returns The latest rate and provider update time (both null on failure/unknown currency), and a loading flag
 */
export function useCurrencyRate(targetCurrency: string | null): CurrencyRateState {
  const [result, setResult] = useState<CurrencyRateResult | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setResult(null)

    if (targetCurrency === null) {
      setLoading(false)
      return
    }

    if (targetCurrency === USD_CURRENCY_CODE) {
      setResult({ rate: 1, updatedAt: null })
      setLoading(false)
      return
    }

    fetchRate(targetCurrency).then((next) => {
      if (cancelled) return
      setResult(next)
      setLoading(false)
    })

    return () => {
      cancelled = true
    }
  }, [targetCurrency])

  return { rate: result?.rate ?? null, updatedAt: result?.updatedAt ?? null, loading }
}
