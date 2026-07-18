/**
 * Popularity score for ranking places, so iconic, heavily-reviewed attractions
 * surface above obscure but higher-starred ones.
 *
 * Star rating alone is a bad ranker: a brand-new cafe with three 5-star reviews
 * outranks the Guinness Storehouse (4.3 stars, 50,000 reviews). Weighting the
 * rating by the log of the review count fixes that — volume signals "this is a
 * place people actually go," and the log keeps a 500k-review landmark from
 * dwarfing a very good 5k-review one.
 *
 *   score = rating × log10(numReviews + 10)
 *
 * The +10 floor gives a real-but-barely-reviewed place a small non-zero base
 * rather than zero. A missing rating falls back to a neutral 3.5 so an unrated
 * real place still ranks (below rated ones, above nothing).
 */
export interface Rankable {
  rating?: number
  numReviews?: number
}

const NEUTRAL_RATING = 3.5
const REVIEW_FLOOR = 10

export function popularityScore(place: Rankable): number {
  const rating = place.rating ?? NEUTRAL_RATING
  return rating * Math.log10((place.numReviews ?? 0) + REVIEW_FLOOR)
}

/** Sort comparator (descending popularity) for use with Array.prototype.sort. */
export function byPopularity(a: Rankable, b: Rankable): number {
  return popularityScore(b) - popularityScore(a)
}
