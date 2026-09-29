import { useEffect, useRef, useState } from 'react'
import { placePhotoUrl, type PlaceDetail } from '../../../lib/api/client'
import { directionsUrl } from '../../../lib/itinerary/badges'
import type { PlaceQuery } from './usePlaceDetail'
import { StopPhotoButton } from '../../photos/StopPhotoButton'
import { StopPhotoStrip } from '../../photos/StopPhotoStrip'
import type { UseTripPhotosResult } from '../../photos/useTripPhotos'

const PRICE = ['Free', '$', '$$', '$$$', '$$$$']

function Stars({ rating, count }: { rating: number | null; count: number | null }) {
  if (rating == null) return null
  return (
    <p className="text-sm font-medium">
      <span aria-hidden="true">★</span> {rating.toFixed(1)}
      {count != null && <span className="font-normal opacity-65"> ({count.toLocaleString()} reviews)</span>}
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
  tripId,
  demoTrip,
  photos,
  planStopId,
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
  /** The current trip, for building photo thumbnail URLs. Required to show photo controls. */
  tripId?: string
  /** True on read-only demo trips — hides the add-photo button. */
  demoTrip?: boolean
  /** The trip's photos, grouped by stop, plus the actions the add/remove controls call. */
  photos?: UseTripPhotosResult
  /** This place's itinerary stop id when it's already on the plan (else null/undefined) — drives whether photo controls show at all. */
  planStopId?: string | null
}) {
  const [pickDay, setPickDay] = useState(defaultDay ?? 1)
  const addPhotoRef = useRef<HTMLButtonElement>(null)
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
  const category = detail?.category ?? query.category ?? null
  const lat = detail?.lat ?? query.lat
  const lng = detail?.lng ?? query.lng
  // Prefer Google's canonical maps URL; else name+coords so partial panels still navigate.
  const directionsHref =
    detail?.mapsUrl ??
    directionsUrl(detail?.name ?? query.label, { lat, lng })
  // After load always render known fields (name/category/coords) so the panel
  // is never empty — partial API responses and client-side query fields both count.
  const showBody = !loading
  const isPartial = Boolean(detail?.partial) || (!loading && detail == null)

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-end justify-center bg-ink-900/60 backdrop-blur-sm sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
    >
      <div
        className="flex max-h-[90dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-[var(--radius-card)] border border-[var(--hairline)] bg-[var(--surface)] shadow-[var(--shadow-lifted)] sm:max-h-[85dvh] sm:rounded-[var(--radius-card)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Pinned header — the title and close button stay put while the body
            scrolls, so the × is always reachable on a long review list. */}
        <div className="flex shrink-0 items-start gap-3 border-b border-[var(--hairline)] px-5 py-4">
          <h2 className="min-w-0 flex-1 font-[family-name:var(--font-display)] text-lg font-semibold leading-snug">{title}</h2>
          <button
            type="button"
            className="-mr-1 grid size-11 shrink-0 place-items-center rounded-lg text-xl leading-none hover:bg-[var(--surface-muted)]"
            onClick={onClose}
            aria-label="Close details"
          >
            ×
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {/* Category chip: derived from query.category, so — like the photo
              block below — it doesn't depend on details loading. Design order
              is title, then this chip, then the Add photos pill, then the
              strip; it must render above the photo block, not inside the
              showBody-gated badge row where the rest of the loaded badges
              (rating/price/open-now) still live. */}
          {category && (
            <div className="flex flex-wrap items-center gap-2 pb-2">
              <span className="rounded-full border border-[var(--hairline)] px-2.5 py-1 text-xs font-medium capitalize">
                {category.replaceAll('_', ' ')}
              </span>
            </div>
          )}

          {/* Photos-first: this block renders unconditionally on whether the place
              is on the plan, OUTSIDE the showBody gate below, so a traveler can add
              or browse a stop's photos while Google's rating/hours/reviews are still
              loading, failed, or only partial — the photo strip is the owner's own
              content, not something that should wait on a third-party API. */}
          {planStopId && tripId && photos && (
            <div className="space-y-2 pb-3">
              {!demoTrip && (
                <StopPhotoButton
                  ref={addPhotoRef}
                  variant="primary"
                  stopName={title}
                  uploading={photos.uploading.has(planStopId)}
                  onSelect={(file) => photos.upload(planStopId, file)}
                />
              )}
              {(photos.byStop.get(planStopId)?.length ?? 0) > 0 ? (
                <StopPhotoStrip
                  tripId={tripId}
                  stopName={title}
                  photos={photos.byStop.get(planStopId) ?? []}
                  onRemove={photos.remove}
                  addButtonRef={addPhotoRef}
                  variant="captioned"
                />
              ) : (
                <div className="chronicle-photo-empty">
                  <svg aria-hidden="true" viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="4" width="18" height="16" rx="2" />
                    <circle cx="8.5" cy="9.5" r="1.5" />
                    <path d="m21 15-5-5L5 20" />
                  </svg>
                  <p>No photos yet — add the first one</p>
                </div>
              )}
              {photos.error && (
                <p role="alert" className="text-sm text-danger-500">
                  {photos.error}
                </p>
              )}
            </div>
          )}

          {loading && <p className="text-sm opacity-70">Loading details…</p>}
          {/* Transient transport/rate-limit failures only — "not found" is a
              partial panel, not an error (server returns 200 + partial). */}
          {error && !isPartial && (
            <p role="alert" className="text-sm text-danger-500">
              {error}
            </p>
          )}

          {showBody && (
          <div className="space-y-3">
            {detail && detail.photoRefs.length > 0 && (
              <div className="-mx-1 flex snap-x gap-2 overflow-x-auto pb-1">
                {detail.photoRefs.map((ref) => (
                  <img key={ref} src={placePhotoUrl(ref, 400)} alt={`${detail.name}`} loading="lazy" className="h-32 w-44 shrink-0 snap-start rounded-xl object-cover" width={400} height={300} decoding="async" />
                ))}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
              {detail && <Stars rating={detail.rating} count={detail.reviewCount} />}
              {detail?.priceLevel != null && PRICE[detail.priceLevel] && (
                <span className="rounded-full border border-[var(--hairline)] px-2.5 py-1 text-xs font-medium">{PRICE[detail.priceLevel]}</span>
              )}
              {detail?.openNow != null && (
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                    detail.openNow
                      ? 'bg-pine-500/15 text-[var(--accent-secondary)]'
                      : 'bg-danger-500/15 text-danger-500'
                  }`}
                >
                  {detail.openNow ? 'Open now' : 'Closed'}
                </span>
              )}
            </div>

            {isPartial && (
              <p className="text-sm opacity-75">
                Full details aren’t available for this place. You can still get directions
                {lat != null && lng != null ? ' from the map pin' : ''}.
              </p>
            )}

            {detail && detail.serves.length > 0 && (
              <p className="text-sm opacity-75">Serves: {detail.serves.join(', ')}</p>
            )}

            {detail?.summary && <p className="text-sm leading-relaxed">{detail.summary}</p>}

            {detail?.address && (
              <p className="text-sm [&_a]:text-[var(--accent-text)] [&_a]:underline [&_a]:underline-offset-4">
                <span aria-hidden="true">📍</span> {detail.address}
              </p>
            )}
            {lat != null && lng != null && !detail?.address && (
              <p className="text-sm opacity-75">
                <span aria-hidden="true">📍</span> {lat.toFixed(5)}, {lng.toFixed(5)}
              </p>
            )}
            {detail?.phone && (
              <p className="text-sm [&_a]:text-[var(--accent-text)] [&_a]:underline [&_a]:underline-offset-4">
                <span aria-hidden="true">☎</span>{' '}
                <a href={`tel:${detail.phone.replace(/[^+\d]/g, '')}`}>{detail.phone}</a>
              </p>
            )}
            {detail?.website && (
              <p className="text-sm [&_a]:text-[var(--accent-text)] [&_a]:underline [&_a]:underline-offset-4">
                <span aria-hidden="true">🔗</span>{' '}
                <a href={detail.website} target="_blank" rel="noopener noreferrer">
                  Website
                </a>
              </p>
            )}

            {detail && detail.hours.length > 0 && (
              <details className="rounded-xl border border-[var(--hairline)] px-3.5 py-2.5 text-sm [&_ul]:mt-2 [&_ul]:space-y-1 [&_ul]:opacity-80 [&>summary]:cursor-pointer [&>summary]:font-medium">
                <summary>Opening hours</summary>
                <ul>
                  {detail.hours.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </details>
            )}

            {detail && detail.reviews.length > 0 && (
              <div className="space-y-3 pt-1">
                <h3 className="font-[family-name:var(--font-display)] text-base font-semibold">Reviews</h3>
                {detail.reviews.map((r, i) => (
                  <blockquote key={i} className="rounded-xl bg-[var(--surface-muted)] px-3.5 py-3 text-sm [&_cite]:mt-1.5 [&_cite]:block [&_cite]:text-xs [&_cite]:not-italic [&_cite]:opacity-65">
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
        </div>

        {/* Pinned action footer — the primary CTAs never hide under the mobile
            nav bar or require scrolling the full review list to reach. */}
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-[var(--hairline)] px-5 py-4">
          {onAddToDay &&
            (onPlanDay != null ? (
              <div className="flex flex-1 items-center gap-2">
                <span className="text-sm font-medium text-[var(--accent-secondary)]">✓ On Day {onPlanDay}</span>
                {onRemoveFromPlan && (
                  <button
                    type="button"
                    className="min-h-[44px] rounded-[var(--radius-pill)] px-3 text-sm font-medium text-[var(--chronicle-danger-text)] hover:bg-danger-50"
                    onClick={onRemoveFromPlan}
                  >
                    Remove from trip
                  </button>
                )}
              </div>
            ) : (
              <div className="flex flex-1 items-center gap-2">
                {dayCount && dayCount > 1 && (
                  <label className="shrink-0 [&_select]:min-h-[44px] [&_select]:rounded-[var(--radius-pill)] [&_select]:border [&_select]:border-[var(--hairline)] [&_select]:bg-[var(--surface)] [&_select]:px-3 [&_select]:text-sm">
                    <span className="sr-only">Day</span>
                    <select value={pickDay} onChange={(e) => setPickDay(Number(e.target.value))}>
                      {Array.from({ length: dayCount }, (_, i) => i + 1).map((d) => (
                        <option key={d} value={d}>
                          Day {d}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <button
                  type="button"
                  className="min-h-[44px] flex-1 rounded-[var(--radius-pill)] bg-[var(--color-primary)] px-4 text-sm font-medium text-[var(--color-on-primary)] hover:bg-[var(--color-primary-hover)]"
                  onClick={() => onAddToDay(dayCount && dayCount > 1 ? pickDay : 1)}
                >
                  {dayCount && dayCount > 1 ? `Add to Day ${pickDay}` : 'Add to trip'}
                </button>
              </div>
            ))}

          <a
            className="inline-flex min-h-[44px] items-center rounded-[var(--radius-pill)] border border-[var(--hairline)] px-4 text-sm font-medium hover:bg-[var(--surface-muted)]"
            href={directionsHref}
            target="_blank"
            rel="noopener noreferrer"
          >
            Get Directions
          </a>
        </div>
      </div>
    </div>
  )
}
