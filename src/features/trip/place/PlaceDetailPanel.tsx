import { useEffect } from 'react'
import { placePhotoUrl, type PlaceDetail } from '../../../lib/api/client'
import { directionsUrl } from '../../../lib/itinerary/badges'
import type { PlaceQuery } from './usePlaceDetail'

const PRICE = ['Free', '$', '$$', '$$$', '$$$$']

function Stars({ rating, count }: { rating: number | null; count: number | null }) {
  if (rating == null) return null
  return (
    <p className="chronicle-place-rating">
      <span aria-hidden="true">★</span> {rating.toFixed(1)}
      {count != null && <span className="chronicle-place-rating-count"> ({count.toLocaleString()} reviews)</span>}
    </p>
  )
}

/**
 * A bottom-sheet detail panel for a place: photos, rating + review count,
 * address, phone, hours, a real review/summary, and a Get Directions button —
 * the tokyo-one/yellowstone-one detail pattern. Every field is real Google
 * data; anything Google doesn't return is simply omitted (no invented menus).
 * Closes on overlay click or Escape. Directions always work (they fall back to
 * a Maps search by name when Google returns no canonical URL).
 */
export function PlaceDetailPanel({
  query,
  detail,
  loading,
  error,
  onClose,
}: {
  query: PlaceQuery
  detail: PlaceDetail | null
  loading: boolean
  error: string | null
  onClose: () => void
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const title = detail?.name ?? query.label
  const directionsHref = detail?.mapsUrl ?? directionsUrl(detail?.name ?? query.label)

  return (
    <div className="chronicle-place-overlay" role="dialog" aria-modal="true" aria-label={title} onClick={onClose}>
      <div className="chronicle-place-sheet" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="chronicle-place-close" onClick={onClose} aria-label="Close details">
          ×
        </button>

        <h2 className="chronicle-place-title">{title}</h2>

        {loading && <p className="chronicle-rate-line">Loading details…</p>}
        {error && (
          <p role="alert" className="chronicle-ai-error">
            {error}
          </p>
        )}

        {detail && (
          <div className="chronicle-place-body">
            {detail.photoRefs.length > 0 && (
              <div className="chronicle-place-photos">
                {detail.photoRefs.map((ref) => (
                  <img key={ref} src={placePhotoUrl(ref, 400)} alt={`${detail.name}`} loading="lazy" className="chronicle-place-photo" />
                ))}
              </div>
            )}

            <div className="chronicle-place-meta">
              <Stars rating={detail.rating} count={detail.reviewCount} />
              {detail.priceLevel != null && PRICE[detail.priceLevel] && (
                <span className="chronicle-place-chip">{PRICE[detail.priceLevel]}</span>
              )}
              {detail.openNow != null && (
                <span className={`chronicle-place-chip ${detail.openNow ? 'chronicle-place-chip--open' : 'chronicle-place-chip--closed'}`}>
                  {detail.openNow ? 'Open now' : 'Closed'}
                </span>
              )}
            </div>

            {detail.serves.length > 0 && (
              <p className="chronicle-place-serves">Serves: {detail.serves.join(', ')}</p>
            )}

            {detail.summary && <p className="chronicle-place-summary">{detail.summary}</p>}

            {detail.address && (
              <p className="chronicle-place-line">
                <span aria-hidden="true">📍</span> {detail.address}
              </p>
            )}
            {detail.phone && (
              <p className="chronicle-place-line">
                <span aria-hidden="true">☎</span>{' '}
                <a href={`tel:${detail.phone.replace(/[^+\d]/g, '')}`}>{detail.phone}</a>
              </p>
            )}
            {detail.website && (
              <p className="chronicle-place-line">
                <span aria-hidden="true">🔗</span>{' '}
                <a href={detail.website} target="_blank" rel="noopener noreferrer">
                  Website
                </a>
              </p>
            )}

            {detail.hours.length > 0 && (
              <details className="chronicle-place-hours">
                <summary>Opening hours</summary>
                <ul>
                  {detail.hours.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </details>
            )}

            {detail.reviews.length > 0 && (
              <div className="chronicle-place-reviews">
                <h3>Reviews</h3>
                {detail.reviews.map((r, i) => (
                  <blockquote key={i} className="chronicle-place-review">
                    <p>“{r.text}”</p>
                    <cite>
                      — {r.author}
                      {r.rating != null && <span aria-hidden="true"> · ★ {r.rating}</span>}
                      {r.relativeTime && <span> · {r.relativeTime}</span>}
                    </cite>
                  </blockquote>
                ))}
              </div>
            )}
          </div>
        )}

        <a className="chronicle-place-directions" href={directionsHref} target="_blank" rel="noopener noreferrer">
          Get Directions
        </a>
      </div>
    </div>
  )
}
