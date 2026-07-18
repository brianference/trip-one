/**
 * Normalizes a location string into a stable cache key (Postgres `locations.slug`,
 * never embedded in a URL path — trip routes use a UUID, not this slug).
 * For Latin-script input: lowercases, strips diacritics/punctuation, hyphenates.
 * For non-Latin script input (e.g. Japanese, Chinese, Cyrillic, Arabic): those
 * scripts have no diacritics/case to strip, so letters are preserved as-is —
 * stripping them to ASCII-only previously produced an EMPTY slug for any query
 * with no Latin characters at all (e.g. "東京都, 日本"), which the backend
 * correctly rejected as invalid. Only punctuation/whitespace is normalized.
 *
 * @example
 * normalizeLocationSlug('Dublin, Ireland') // → 'dublin-ireland'
 * normalizeLocationSlug('São Paulo, Brazil') // → 'sao-paulo-brazil'
 * normalizeLocationSlug('東京都, 日本') // → '東京都-日本'
 *
 * @param input - A location string (e.g., "Dublin, Ireland", "東京都, 日本")
 * @returns A normalized, non-empty slug used as a D1 cache key
 */
export function normalizeLocationSlug(input: string): string {
  const latinNormalized = input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')

  if (latinNormalized.length > 0) return latinNormalized

  // Non-Latin script (or otherwise produced an empty result): preserve the
  // original letters, only normalize whitespace/punctuation to hyphens.
  return input
    .toLowerCase()
    .replace(/[,!?'"()]/g, ' ')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
}
