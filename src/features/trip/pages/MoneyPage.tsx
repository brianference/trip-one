import { useState } from 'react'
import { useTripContext } from '../useTripContext'
import { destinationFor } from '../../localinfo/destination'
import { useCurrencyRate } from '../../localinfo/useCurrencyRate'
import { presetRows, formatMoney } from '../../localinfo/moneyAmounts'

/** open.er-api.com's terms require this visible credit, linking to their site, on any page that shows its rates. */
const EXCHANGE_RATE_API_URL = 'https://www.exchangerate-api.com'
const USD_CURRENCY_CODE = 'USD'

/**
 * Extracts the currency symbol Intl renders for a code (e.g. "¥" for JPY,
 * "€" for EUR), so the reverse-converter label reads naturally ("¥ to $")
 * instead of the bare ISO code.
 * @param currency - ISO 4217 currency code
 * @returns The symbol Intl formats that currency with, or the code itself if Intl doesn't recognize it
 */
function currencySymbolFor(currency: string): string {
  try {
    const part = new Intl.NumberFormat('en-US', { style: 'currency', currency }).formatToParts(0).find((p) => p.type === 'currency')
    return part?.value ?? currency
  } catch {
    return currency
  }
}

/**
 * Formats the rate provider's "updated at" timestamp as a readable date,
 * pinned to UTC so the shown date matches what the provider actually
 * reported regardless of the viewer's own timezone.
 * @param updatedAt - The provider's timestamp string, e.g. "Tue, 29 Sep 2026 00:02:31 +0000"
 * @returns A human date such as "September 29, 2026", or the raw string if it doesn't parse
 */
function formatUpdatedAt(updatedAt: string): string {
  const date = new Date(updatedAt)
  if (Number.isNaN(date.getTime())) return updatedAt
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' })
}

/**
 * Converts a local-currency amount to its USD equivalent at `rate`, formatted
 * as US currency.
 * @param localAmountText - The raw text typed into the reverse-converter input
 * @param rate - Units of the local currency per 1 USD, or null when unavailable
 * @returns A formatted USD string, or null when the input isn't a usable number
 */
function usdEquivalentFor(localAmountText: string, rate: number | null): string | null {
  if (rate === null || localAmountText.trim() === '') return null
  const localAmount = Number(localAmountText)
  if (!Number.isFinite(localAmount)) return null
  return (localAmount / rate).toLocaleString('en-US', { style: 'currency', currency: USD_CURRENCY_CODE })
}

/**
 * The trip's Money page: a quick reference for converting between US
 * dollars and the destination's currency at today's rate — a table of
 * common USD amounts converted to the local currency, plus a reverse
 * converter for an arbitrary local-currency amount. Rates come from
 * open.er-api.com via this app's `/api/currency` proxy; its terms require
 * the attribution link at the bottom of the page.
 */
export function MoneyPage() {
  const { location } = useTripContext()
  const destination = destinationFor(location?.displayName)
  const currency = destination.status === 'known' ? destination.currency : USD_CURRENCY_CODE
  const { rate, updatedAt, loading } = useCurrencyRate(currency)
  const [localAmountText, setLocalAmountText] = useState('')
  const usdEquivalent = usdEquivalentFor(localAmountText, rate)

  return (
    <article className="chronicle-chapter">
      <h1>Money</h1>

      {loading && <p className="chronicle-rate-line">Loading exchange rate…</p>}

      {!loading && rate === null && <p className="chronicle-rate-line">Currency rate unavailable right now.</p>}

      {!loading && rate !== null && (
        <>
          <p className="chronicle-rate-line">
            $1 ≈ <strong>{formatMoney(rate, currency)}</strong>
          </p>
          {updatedAt && <p className="chronicle-rate-line">Rates updated {formatUpdatedAt(updatedAt)}</p>}

          <table className="chronicle-money-table">
            <caption>Common amounts converted at today's rate</caption>
            <thead>
              <tr>
                <th scope="col">US dollars</th>
                <th scope="col">{currency}</th>
              </tr>
            </thead>
            <tbody>
              {presetRows(rate, currency).map((row) => (
                <tr key={row.usd}>
                  <td>{row.usd}</td>
                  <td>{row.local}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="chronicle-currency-tool">
            <label htmlFor="money-reverse-input">{currencySymbolFor(currency)} to $</label>
            <input
              id="money-reverse-input"
              type="text"
              inputMode="decimal"
              className="chronicle-currency-input"
              value={localAmountText}
              onChange={(e) => setLocalAmountText(e.target.value)}
            />
            {usdEquivalent && (
              <span className="chronicle-currency-eq">
                = <strong>{usdEquivalent}</strong>
              </span>
            )}
          </div>

          <p className="chronicle-rate-line">
            <a className="chronicle-preview-link" href={EXCHANGE_RATE_API_URL} target="_blank" rel="noopener">
              Rates By Exchange Rate API
            </a>
          </p>
        </>
      )}
    </article>
  )
}
