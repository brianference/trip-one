import { useState } from 'react'
import { useTripContext } from '../useTripContext'
import { destinationFor, type DestinationInfo } from '../../localinfo/destination'
import { useCurrencyRate } from '../../localinfo/useCurrencyRate'
import { presetRows, formatMoney } from '../../localinfo/moneyAmounts'

/** open.er-api.com's terms require this visible credit, linking to their site, on any page that shows its rates. */
const EXCHANGE_RATE_API_URL = 'https://www.exchangerate-api.com'
const USD_CURRENCY_CODE = 'USD'

/**
 * Extracts the currency symbol Intl renders for a code (e.g. "¥" for JPY,
 * "€" for EUR).
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
 * Builds the reverse-converter's accessible label. Spells out the ISO code
 * rather than relying on the symbol alone — several currencies share a "$"
 * or similar glyph (CA$, AU$, HK$…), so "$ to $" would be ambiguous for a
 * screen reader user in a way the visual symbol next to a flag isn't.
 * @param currency - ISO 4217 currency code
 * @returns A label such as "Convert ¥ (JPY) to US dollars"
 */
function reverseConverterLabel(currency: string): string {
  return `Convert ${currencySymbolFor(currency)} (${currency}) to US dollars`
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
 * as US currency. Strips thousands-separator commas first ("1,000" is a
 * normal amount to type, not an invalid one) — without this, `Number()`
 * returns `NaN` and the result silently disappears.
 * @param localAmountText - The raw text typed into the reverse-converter input
 * @param rate - Units of the local currency per 1 USD, or null when unavailable
 * @returns A formatted USD string, or null when the input isn't a usable number
 */
function usdEquivalentFor(localAmountText: string, rate: number | null): string | null {
  if (rate === null || localAmountText.trim() === '') return null
  const localAmount = Number(localAmountText.replace(/,/g, ''))
  if (!Number.isFinite(localAmount)) return null
  return (localAmount / rate).toLocaleString('en-US', { style: 'currency', currency: USD_CURRENCY_CODE })
}

/** Whether the destination needs no currency conversion at all: a domestic (USD) trip, or one `destinationFor` didn't mark international. */
function needsNoConversion(destination: DestinationInfo): boolean {
  return destination.status === 'known' && (destination.currency === USD_CURRENCY_CODE || !destination.international)
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
  // Always call the hook (Rules of Hooks) even when no conversion is needed
  // below — for a domestic/USD destination this just resolves the trivial
  // rate-of-1 short-circuit in `useCurrencyRate`, with no network call.
  const currency = destination.status === 'known' ? destination.currency : USD_CURRENCY_CODE
  const { rate, updatedAt, loading } = useCurrencyRate(currency)
  const [localAmountText, setLocalAmountText] = useState('')
  const usdEquivalent = usdEquivalentFor(localAmountText, rate)

  return (
    <article className="chronicle-chapter">
      <h1>Money</h1>

      {destination.status === 'loading' && <p className="chronicle-rate-line">Loading…</p>}

      {needsNoConversion(destination) && (
        <p className="chronicle-rate-line">No currency conversion needed for this trip — prices here are in US dollars.</p>
      )}

      {destination.status === 'known' && !needsNoConversion(destination) && (
        <>
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
                <label htmlFor="money-reverse-input">{reverseConverterLabel(currency)}</label>
                <input
                  id="money-reverse-input"
                  type="text"
                  inputMode="decimal"
                  className="chronicle-currency-input chronicle-currency-input--lg"
                  value={localAmountText}
                  onChange={(e) => setLocalAmountText(e.target.value)}
                />
                <output htmlFor="money-reverse-input" aria-live="polite" className="chronicle-currency-eq">
                  {usdEquivalent && (
                    <>
                      = <strong>{usdEquivalent}</strong>
                    </>
                  )}
                </output>
              </div>

              <p className="chronicle-rate-line">
                <a className="chronicle-preview-link" href={EXCHANGE_RATE_API_URL} target="_blank" rel="noopener">
                  Rates By Exchange Rate API
                </a>
              </p>
            </>
          )}
        </>
      )}
    </article>
  )
}
