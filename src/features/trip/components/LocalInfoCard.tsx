import { currencyForDisplayName } from '../../localinfo/currencyByCountry'
import { useCurrencyRate } from '../../localinfo/useCurrencyRate'

/** Currency rate, transit directions, and phrasebook links for the destination. */
export function LocalInfoCard({ displayName }: { displayName: string }) {
  const targetCurrency = currencyForDisplayName(displayName)
  const { rate, loading } = useCurrencyRate(targetCurrency)
  const transitUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`public transit in ${displayName}`)}`
  const translateUrl = 'https://translate.google.com/?sl=en&tl=auto&op=translate'

  return (
    <>
      {!loading && rate !== null && (
        <p className="chronicle-rate-line">
          1 USD ≈ <strong>{rate}</strong> {targetCurrency}
        </p>
      )}
      {!loading && rate === null && <p className="chronicle-rate-line">Currency rate unavailable right now.</p>}
      <ul className="chronicle-link-list">
        <li>
          <a href={transitUrl} target="_blank" rel="noopener noreferrer">
            Transit directions
          </a>
        </li>
        <li>
          <a href={translateUrl} target="_blank" rel="noopener noreferrer">
            Phrasebook
          </a>
        </li>
      </ul>
    </>
  )
}
