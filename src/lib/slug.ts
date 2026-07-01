/**
 * Normalizes a location string into a URL/cache-key-safe slug.
 * Lowercases, removes diacritics, strips punctuation, and replaces whitespace with hyphens.
 *
 * @example
 * normalizeLocationSlug('Dublin, Ireland') // → 'dublin-ireland'
 * normalizeLocationSlug('São Paulo, Brazil') // → 'sao-paulo-brazil'
 *
 * @param input - A location string (e.g., "Dublin, Ireland", "New York, USA")
 * @returns A normalized slug safe for URLs and cache keys
 */
export function normalizeLocationSlug(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
}
