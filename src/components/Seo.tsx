import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

/**
 * Per-route document metadata, without a helmet dependency.
 *
 * This app is client-rendered, so crawlers that execute JavaScript (Google,
 * Bing) read these tags after hydration. Tags that must be correct for
 * non-executing crawlers and social unfurlers — the site-wide defaults — live
 * in index.html; this only overrides per route.
 *
 * Every tag it writes is marked `data-seo` so a later route can clean up
 * exactly what a previous route added, and never a static tag from index.html.
 */

export const SITE_URL = 'https://trip-one.pages.dev'
export const SITE_NAME = 'Trip One'

export interface SeoProps {
  title: string
  description: string
  /** Absolute path, e.g. `/about`. Defaults to the current location. */
  path?: string
  /** Absolute URL to the social preview image. */
  image?: string
  /** `noindex` for pages with no standalone search value (e.g. a private dashboard). */
  noindex?: boolean
  /** JSON-LD, serialised into a script tag. */
  jsonLd?: Record<string, unknown>
}

function upsertMeta(attr: 'name' | 'property', key: string, content: string): void {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`)
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute(attr, key)
    el.setAttribute('data-seo', 'true')
    document.head.appendChild(el)
  }
  el.setAttribute('content', content)
}

function upsertLink(rel: string, href: string): void {
  let el = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`)
  if (!el) {
    el = document.createElement('link')
    el.setAttribute('rel', rel)
    el.setAttribute('data-seo', 'true')
    document.head.appendChild(el)
  }
  el.setAttribute('href', href)
}

export function Seo({ title, description, path, image, noindex = false, jsonLd }: SeoProps) {
  const location = useLocation()
  const url = `${SITE_URL}${path ?? location.pathname}`
  const fullTitle = title === SITE_NAME ? title : `${title} — ${SITE_NAME}`
  const socialImage = image ?? `${SITE_URL}/og.png`

  useEffect(() => {
    document.title = fullTitle
    upsertMeta('name', 'description', description)
    // A canonical URL keeps query-string and trailing-slash variants from being
    // indexed as separate pages.
    upsertLink('canonical', url)
    upsertMeta('name', 'robots', noindex ? 'noindex, nofollow' : 'index, follow')

    upsertMeta('property', 'og:title', fullTitle)
    upsertMeta('property', 'og:description', description)
    upsertMeta('property', 'og:url', url)
    upsertMeta('property', 'og:type', 'website')
    upsertMeta('property', 'og:site_name', SITE_NAME)
    upsertMeta('property', 'og:image', socialImage)

    upsertMeta('name', 'twitter:card', 'summary_large_image')
    upsertMeta('name', 'twitter:title', fullTitle)
    upsertMeta('name', 'twitter:description', description)
    upsertMeta('name', 'twitter:image', socialImage)
  }, [fullTitle, description, url, noindex, socialImage])

  useEffect(() => {
    if (!jsonLd) return
    const script = document.createElement('script')
    script.type = 'application/ld+json'
    script.setAttribute('data-seo-jsonld', 'true')
    script.textContent = JSON.stringify(jsonLd)
    document.head.appendChild(script)
    // Removed on unmount so a route's structured data never bleeds into the next.
    return () => {
      script.remove()
    }
  }, [jsonLd])

  return null
}
