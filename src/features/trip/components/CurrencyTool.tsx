import { useState } from 'react'

/**
 * A compact USD → local-currency converter, presentational only — the code and
 * rate are resolved once by the shell and passed in, so the same tool can be
 * rendered in more than one place (the nav on desktop, a top chip on mobile)
 * without fetching twice. Renders nothing for a US / USD destination (where
 * "1 USD ≈ 1 USD" is noise) or when the rate isn't available.
 *
 * @param code - The destination's ISO 4217 currency code
 * @param rate - USD → `code` exchange rate, or null when unavailable
 */
export function CurrencyTool({ code, rate }: { code: string; rate: number | null }) {
  const [usd, setUsd] = useState('1')

  if (code === 'USD' || rate === null) return null

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
