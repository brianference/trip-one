import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { fetchLocation, type LocationResult } from '../../lib/api/client'
import { currencyForDisplayName } from '../../features/localinfo/currencyByCountry'
import { useCurrencyRate } from '../../features/localinfo/useCurrencyRate'
import { logger } from '../../lib/logger'

/**
 * Local info screen for Chronicle theme — currency conversion plus transit
 * and phrasebook links, styled as another chapter in the timeline.
 */
export function LocalInfoScreen({ locationSlug }: { locationSlug: string }) {
  const { id } = useParams<{ id: string }>()
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
    <div className="chronicle-page">
      <article className="chronicle-chapter">
        {id && (
          <nav>
            <Link to={`/trip/${id}`}>Overview</Link>
            {' · '}
            <Link to={`/trip/${id}/itinerary`}>Itinerary</Link>
            {' · '}
            <Link to={`/trip/${id}/things-to-do`}>Things to do</Link>
            {' · '}
            <Link to={`/trip/${id}/local-info`} aria-current="page">
              Local info
            </Link>
          </nav>
        )}
        <span className="chronicle-kicker">Field notes</span>
        <h1>Local info: {displayName}</h1>
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
      </article>
    </div>
  )
}
