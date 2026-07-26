import { formatDurationMinutes } from '../../../lib/itinerary/dayCapacity'

/**
 * Shape shared by ThingToDo and itinerary experience stops for the card UI.
 * Only real upstream fields — never invent price, currency, or duration here.
 */
export interface ExperienceCardData {
  name: string
  rating?: number
  numReviews?: number
  priceFrom?: number
  currency?: string
  durationMinutes?: number
  bookingUrl?: string
  freeCancellation?: boolean
}

/**
 * Formats a price only when currency is confirmed. An unlabeled number is a
 * 100× error if yen is shown as dollars — better no price than a wrong one.
 *
 * @param amount - Real from-price from Viator
 * @param currency - Confirmed ISO 4217 code
 */
export function formatExperiencePrice(amount: number, currency: string): string {
  const code = currency.trim().toUpperCase()
  if (!code || code.length !== 3) return ''
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: code }).format(amount)
  } catch {
    // Unknown currency code to Intl — still label it so it is never bare digits.
    return `${amount} ${code}`
  }
}

/**
 * Whether the card may show a price. Requires both a finite amount and a
 * confirmed 3-letter currency. Spec: unlabeled numbers are forbidden.
 *
 * @param data - Experience fields from the real API
 */
export function canShowExperiencePrice(data: Pick<ExperienceCardData, 'priceFrom' | 'currency'>): boolean {
  if (data.priceFrom == null || !Number.isFinite(data.priceFrom)) return false
  const code = data.currency?.trim() ?? ''
  return code.length === 3
}

/** Plain-language affiliate line required next to every booking link (FTC). */
export const AFFILIATE_DISCLOSURE =
  'Trip One may earn a commission if you book through this Viator link, at no extra cost to you.'

/**
 * Bookable experience card — visually distinct from ordinary POI stops because
 * it costs money and leaves the site. Uses Chronicle theme tokens only.
 *
 * Shows: title, rating + review count, duration in plain language from real
 * minutes, free-cancellation badge when confirmed, price only with currency,
 * and a "Book on Viator" link with rel="sponsored noopener noreferrer".
 */
export function ExperienceCard({
  item,
  onRemove,
  compact,
}: {
  item: ExperienceCardData
  /** Optional remove control when rendered inside the itinerary. */
  onRemove?: () => void
  /** Tighter layout when embedded in the day timeline. */
  compact?: boolean
}) {
  const duration =
    item.durationMinutes != null && item.durationMinutes > 0
      ? formatDurationMinutes(item.durationMinutes)
      : ''
  const showPrice = canShowExperiencePrice(item)
  const priceLabel = showPrice ? formatExperiencePrice(item.priceFrom as number, item.currency as string) : ''
  const hasBooking = typeof item.bookingUrl === 'string' && item.bookingUrl.trim() !== ''

  return (
    <article
      className={`chronicle-experience-card${compact ? ' chronicle-experience-card--compact' : ''}`}
      aria-label={`Bookable experience: ${item.name}`}
    >
      <div className="chronicle-experience-card__kicker">
        <span className="chronicle-experience-card__badge">Bookable experience</span>
        {item.freeCancellation === true && (
          <span className="chronicle-experience-card__free-cancel">Free cancellation</span>
        )}
      </div>

      <h3 className="chronicle-experience-card__title">{item.name}</h3>

      <div className="chronicle-experience-card__meta">
        {item.rating != null && Number.isFinite(item.rating) && (
          <span className="chronicle-experience-card__rating">
            <span aria-hidden="true">★</span> {item.rating.toFixed(1)}
            {item.numReviews != null && Number.isFinite(item.numReviews) && item.numReviews > 0
              ? ` (${item.numReviews.toLocaleString()} reviews)`
              : ''}
          </span>
        )}
        {duration && <span className="chronicle-experience-card__duration">{duration}</span>}
        {showPrice && priceLabel && (
          <span className="chronicle-experience-card__price">From {priceLabel}</span>
        )}
      </div>

      {hasBooking && (
        <div className="chronicle-experience-card__book-row">
          <a
            className="chronicle-experience-card__book"
            href={item.bookingUrl}
            target="_blank"
            rel="sponsored noopener noreferrer"
          >
            Book on Viator
          </a>
          {onRemove && (
            <button
              type="button"
              className="chronicle-experience-card__remove"
              onClick={onRemove}
              aria-label={`Remove ${item.name} from itinerary`}
            >
              Remove
            </button>
          )}
        </div>
      )}

      {hasBooking && (
        <p className="chronicle-experience-card__disclosure">{AFFILIATE_DISCLOSURE}</p>
      )}
    </article>
  )
}
