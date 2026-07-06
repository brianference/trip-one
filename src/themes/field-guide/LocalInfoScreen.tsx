import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { fetchLocation, type LocationResult } from '../../lib/api/client'
import { currencyForDisplayName } from '../../features/localinfo/currencyByCountry'
import { useCurrencyRate } from '../../features/localinfo/useCurrencyRate'
import { logger } from '../../lib/logger'

/**
 * Local info screen for Field Guide theme — currency conversion plus transit
 * and phrasebook links, styled as a postcard-style overlay card.
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
    <div className="field-guide-app-screen">
      <div className="field-guide-info-card">
        {id && (
          <ul className="field-guide-nav">
            <li>
              <Link to={`/trip/${id}`}>Overview</Link>
            </li>
            <li>
              <Link to={`/trip/${id}/itinerary`}>Itinerary</Link>
            </li>
            <li>
              <Link to={`/trip/${id}/things-to-do`}>Things to do</Link>
            </li>
            <li>
              <Link to={`/trip/${id}/local-info`} aria-current="page">
                Local info
              </Link>
            </li>
          </ul>
        )}
        <p className="field-guide-eyebrow">Local info</p>
        <h1>{displayName}</h1>
        {!loading && rate !== null && (
          <p className="field-guide-rate-line">
            1 USD ≈ <strong>{rate}</strong> {targetCurrency}
          </p>
        )}
        {!loading && rate === null && <p className="field-guide-rate-line">Currency rate unavailable right now.</p>}
        <div className="field-guide-link-row">
          <a href={transitUrl} target="_blank" rel="noopener noreferrer">
            Transit directions
          </a>
          <a href={translateUrl} target="_blank" rel="noopener noreferrer">
            Phrasebook
          </a>
        </div>
      </div>
    </div>
  )
}
