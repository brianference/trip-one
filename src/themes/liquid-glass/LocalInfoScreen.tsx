import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { fetchLocation, type LocationResult } from '../../lib/api/client'
import { currencyForDisplayName } from '../../features/localinfo/currencyByCountry'
import { useCurrencyRate } from '../../features/localinfo/useCurrencyRate'
import { logger } from '../../lib/logger'

/**
 * Local info screen for Liquid Glass theme — currency conversion plus
 * transit and phrasebook links, styled with the frosted glass card.
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
    <div className="lg-app-screen">
      <div className="lg-glass-card">
        {id && (
          <nav className="lg-nav">
            <Link className="lg-tap-target lg-nav-link" to={`/trip/${id}`}>
              Overview
            </Link>
            <Link className="lg-tap-target lg-nav-link" to={`/trip/${id}/itinerary`}>
              Itinerary
            </Link>
            <Link className="lg-tap-target lg-nav-link" to={`/trip/${id}/things-to-do`}>
              Things to do
            </Link>
            <Link className="lg-tap-target lg-nav-link" to={`/trip/${id}/local-info`} aria-current="page">
              Local info
            </Link>
          </nav>
        )}
        <h1 className="lg-title">Local info: {displayName}</h1>
        {!loading && rate !== null && (
          <p className="lg-rate-row">
            <span className="lg-rate-value">1 USD ≈ {rate}</span>
            <span className="lg-rate-currency">{targetCurrency}</span>
          </p>
        )}
        {!loading && rate === null && <p className="lg-rate-unavailable">Currency rate unavailable right now.</p>}
        <div className="lg-link-row">
          <a className="lg-tap-target lg-btn lg-btn-secondary" href={transitUrl} target="_blank" rel="noopener noreferrer">
            Transit directions
          </a>
          <a className="lg-tap-target lg-btn lg-btn-secondary" href={translateUrl} target="_blank" rel="noopener noreferrer">
            Phrasebook
          </a>
        </div>
      </div>
    </div>
  )
}
