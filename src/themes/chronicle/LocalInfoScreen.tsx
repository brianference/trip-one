import { useEffect, useState } from 'react'
import { fetchLocation, type LocationResult } from '../../lib/api/client'
import { currencyForDisplayName } from '../../features/localinfo/currencyByCountry'
import { useCurrencyRate } from '../../features/localinfo/useCurrencyRate'
import { logger } from '../../lib/logger'

/**
 * Local info screen for Chronicle theme — currency conversion plus transit
 * and phrasebook links, styled as another chapter in the timeline.
 */
export function LocalInfoScreen({ locationSlug }: { locationSlug: string }) {
  const [location, setLocation] = useState<LocationResult | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchLocation(locationSlug)
      .then((loc) => {
        if (!cancelled) setLocation(loc)
      })
      .catch((err) => {
        logger.error('failed to load local info', err)
      })
    return () => {
      cancelled = true
    }
  }, [locationSlug])

  const displayName = location?.displayName ?? locationSlug
  const targetCurrency = currencyForDisplayName(displayName)
  const { rate, loading } = useCurrencyRate(targetCurrency)
  const transitUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`public transit in ${displayName}`)}`
  const translateUrl = 'https://translate.google.com/?sl=en&tl=auto&op=translate'

  return (
    <article className="chronicle-chapter">
      <h1>Local info: {displayName}</h1>
      {!loading && rate !== null && (
        <p>
          1 USD ≈ {rate} {targetCurrency}
        </p>
      )}
      {!loading && rate === null && <p>Currency rate unavailable right now.</p>}
      <p>
        <a href={transitUrl} target="_blank" rel="noopener noreferrer">
          Transit directions
        </a>
      </p>
      <p>
        <a href={translateUrl} target="_blank" rel="noopener noreferrer">
          Phrasebook
        </a>
      </p>
    </article>
  )
}
