import { useEffect, useState } from 'react'
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
  dayCount,
  defaultDay,
  onPlanDay,
  onAddToDay,
  onRemoveFromPlan,
}: {
  query: PlaceQuery
  detail: PlaceDetail | null
  loading: boolean
  error: string | null
  onClose: () => void
  /** Number of days available to add to (enables the plan CTA when > 0). */
  dayCount?: number
  /** The day to preselect in the picker. */
  defaultDay?: number
  /** If this place is already on the plan, which day it's on (else null). */
  onPlanDay?: number | null
  /** Add this place to the given day. */
  onAddToDay?: (day: number) => void
  /** Remove this place from the plan. */
  onRemoveFromPlan?: () => void
}) {
  const [pickDay, setPickDay] = useState(defaultDay ?? 1)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    // Lock background scroll while the sheet is open, so the page behind it
    // doesn't scroll under the overlay on touch devices.
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
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

        {onAddToDay &&
          (onPlanDay != null ? (
            <div className="chronicle-place-plan">
              <span className="chronicle-place-on-plan">✓ On Day {onPlanDay}</span>
              {onRemoveFromPlan && (
                <button type="button" className="chronicle-place-remove" onClick={onRemoveFromPlan}>
                  Remove from trip
                </button>
              )}
            </div>
          ) : (
            <div className="chronicle-place-plan">
              {dayCount && dayCount > 1 && (
                <label className="chronicle-place-day-pick">
                  <span className="chronicle-sr-only">Day</span>
                  <select value={pickDay} onChange={(e) => setPickDay(Number(e.target.value))}>
                    {Array.from({ length: dayCount }, (_, i) => i + 1).map((d) => (
                      <option key={d} value={d}>
                        Day {d}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <button type="button" className="chronicle-place-add" onClick={() => onAddToDay(dayCount && dayCount > 1 ? pickDay : 1)}>
                {dayCount && dayCount > 1 ? `Add to Day ${pickDay}` : 'Add to trip'}
              </button>
            </div>
          ))}

        <a className="chronicle-place-directions" href={directionsHref} target="_blank" rel="noopener noreferrer">
          Get Directions
        </a>
      </div>
    </div>
  )
}
