import { logger } from '../../src/lib/logger'

/**
 * Web search + lightweight page fetch, used to ground trip planning in real
 * travel-guide content rather than a raw nearby-places dump. Brave's Web Search
 * API returns titles + descriptions (already rich with venue names); the top
 * few result pages are then fetched and stripped to text so the model can
 * extract the specific places a guide recommends.
 *
 * Everything fails soft: a search or fetch failure yields fewer sources, never
 * a thrown error, so a flaky guide never blocks a trip from being built.
 */

export interface WebResult {
  title: string
  url: string
  description: string
}

/** How many search results to keep, and how many of them to fetch full text for. */
const SEARCH_COUNT = 8
const FETCH_TOP_N = 3
/** Cap the stripped text per page so the extraction prompt stays affordable. */
const MAX_PAGE_CHARS = 4000

/**
 * Brave Web Search. Returns up to {@link SEARCH_COUNT} results (title, url,
 * description), or an empty list on any failure.
 * @param query - The search query
 * @param apiKey - Brave Search API subscription token
 */
export async function braveSearch(query: string, apiKey: string): Promise<WebResult[]> {
  try {
    const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${SEARCH_COUNT}`
    const res = await fetch(url, { headers: { Accept: 'application/json', 'X-Subscription-Token': apiKey } })
    if (!res.ok) {
      logger.warn('brave search non-ok', { status: res.status })
      return []
    }
    const body = (await res.json()) as { web?: { results?: Array<{ title?: string; url?: string; description?: string }> } }
    return (body.web?.results ?? [])
      .filter((r) => r.url && r.title)
      .map((r) => ({ title: r.title as string, url: r.url as string, description: r.description ?? '' }))
  } catch (err) {
    logger.error('brave search failed', err)
    return []
  }
}

/**
 * Strips HTML to plain text: removes script/style/head, drops tags, collapses
 * whitespace, and decodes the handful of entities that matter for venue names.
 * Deliberately simple — this feeds an LLM, not a renderer.
 */
export function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<head[\s\S]*?<\/head>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#39;|&rsquo;|&lsquo;/g, "'")
    .replace(/&quot;|&ldquo;|&rdquo;/g, '"')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Fetches one page and returns its stripped text (capped), or '' on failure. */
async function fetchPageText(url: string): Promise<string> {
  try {
    const res = await fetch(url, {
      headers: {
        // A real UA — some guide sites 403 an empty one.
        'User-Agent': 'Mozilla/5.0 (compatible; trip-one/1.0; +https://trip-one.pages.dev)',
        Accept: 'text/html',
      },
      // Don't let one slow guide stall the whole trip build.
      signal: AbortSignal.timeout(6000),
    })
    if (!res.ok) return ''
    const ct = res.headers.get('content-type') ?? ''
    if (!ct.includes('text/html')) return ''
    return htmlToText(await res.text()).slice(0, MAX_PAGE_CHARS)
  } catch {
    return ''
  }
}

/**
 * A compact digest of real travel-guide content for a query: each source's
 * title, description, and (for the top few) stripped page text. This is the
 * raw material the venue-extraction prompt reads.
 * @returns A text block, or '' if nothing could be gathered
 */
export async function gatherGuideContent(query: string, apiKey: string): Promise<string> {
  const results = await braveSearch(query, apiKey)
  if (results.length === 0) return ''

  const pageTexts = await Promise.all(results.slice(0, FETCH_TOP_N).map((r) => fetchPageText(r.url)))

  const parts: string[] = []
  results.forEach((r, i) => {
    parts.push(`SOURCE ${i + 1}: ${r.title}\n${r.description}`)
    if (i < FETCH_TOP_N && pageTexts[i]) parts.push(pageTexts[i])
  })
  return parts.join('\n\n')
}
