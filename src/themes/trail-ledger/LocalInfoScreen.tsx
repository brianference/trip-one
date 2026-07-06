import { useEffect, useState } from 'react'
import { fetchLocation, type LocationResult } from '../../lib/api/client'
import { currencyForDisplayName } from '../../features/localinfo/currencyByCountry'
import { useCurrencyRate } from '../../features/localinfo/useCurrencyRate'
import { logger } from '../../lib/logger'

/**
 * Local info screen for Trail Ledger theme — currency conversion plus
 * transit and phrasebook links, displayed as a two-column table.
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
    <div className="tl-ledger">
      <table>
        <tbody>
          <tr>
            <th>Location</th>
            <td>{displayName}</td>
          </tr>
          <tr>
            <th>Exchange rate</th>
            <td>{!loading && rate !== null ? `1 USD ≈ ${rate} ${targetCurrency}` : 'Unavailable right now'}</td>
          </tr>
          <tr>
            <th>Transit</th>
            <td>
              <a href={transitUrl} target="_blank" rel="noopener noreferrer">
                Transit directions
              </a>
            </td>
          </tr>
          <tr>
            <th>Phrasebook</th>
            <td>
              <a href={translateUrl} target="_blank" rel="noopener noreferrer">
                Phrasebook
              </a>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}
