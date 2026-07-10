import { currencyForDisplayName } from '../../localinfo/currencyByCountry'
import { useCurrencyRate } from '../../localinfo/useCurrencyRate'

/**
 * Local info for the destination: currency (only when it differs from USD —
 * a US trip has no "1 USD ≈ 1 USD" line) and public transit as a card. The
 * phrasebook has its own page/nav entry, so it isn't repeated here.
 */
export function LocalInfoCard({ displayName }: { displayName: string }) {
  const targetCurrency = currencyForDisplayName(displayName)
  // Same-currency destinations (US) get no exchange line — it would just read
  // "1 USD ≈ 1 USD", which is noise.
  const showCurrency = targetCurrency !== 'USD'
  const { rate, loading } = useCurrencyRate(targetCurrency)
  const transitUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`public transit in ${displayName}`)}`

  return (
    <>
      {showCurrency && !loading && rate !== null && (
        <p className="chronicle-rate-line">
          1 USD ≈ <strong>{rate}</strong> {targetCurrency}
        </p>
      )}
      {showCurrency && !loading && rate === null && <p className="chronicle-rate-line">Currency rate unavailable right now.</p>}

      <a className="chronicle-transit-card" href={transitUrl} target="_blank" rel="noopener noreferrer">
        <span className="chronicle-transit-icon" aria-hidden="true">🚌</span>
        <span className="chronicle-transit-body">
          <span className="chronicle-transit-title">Getting around</span>
          <span className="chronicle-transit-sub">Public transit &amp; directions in {displayName}</span>
        </span>
        <span className="chronicle-transit-arrow" aria-hidden="true">→</span>
      </a>
    </>
  )
}
