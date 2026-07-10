import { useState } from 'react'
import { currencyForDisplayName } from '../../localinfo/currencyByCountry'
import { useCurrencyRate } from '../../localinfo/useCurrencyRate'

/**
 * A compact USD → local-currency converter for the trip header. Renders nothing
 * for US / USD destinations (where "1 USD ≈ 1 USD" is noise) or when the rate
 * can't be fetched. Type an amount in USD and it shows the live local total.
 *
 * @param displayName - The destination display name (its country picks the currency)
 */
export function CurrencyTool({ displayName }: { displayName: string }) {
  const code = currencyForDisplayName(displayName)
  const { rate, loading } = useCurrencyRate(code)
  const [usd, setUsd] = useState('1')

  // Nothing to convert for a same-currency (US) destination, or if the rate
  // isn't available — stay silent rather than show a broken tool.
  if (code === 'USD' || loading || rate === null) return null

  const amount = Number(usd)
  const converted = Number.isFinite(amount) ? (amount * rate).toLocaleString(undefined, { maximumFractionDigits: 2 }) : '—'

  return (
    <div className="chronicle-currency-tool" aria-label={`Convert US dollars to ${code}`}>
      <span className="chronicle-currency-icon" aria-hidden="true">💱</span>
      <span className="chronicle-currency-eq">$</span>
      <input
        type="number"
        inputMode="decimal"
        min="0"
        className="chronicle-currency-input"
        value={usd}
        onChange={(e) => setUsd(e.target.value)}
        aria-label="Amount in US dollars"
      />
      <span className="chronicle-currency-eq">
        = <strong>{converted}</strong> {code}
      </span>
    </div>
  )
}
