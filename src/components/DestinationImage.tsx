import { useState } from 'react'

/**
 * Destination imagery, sized for the device that's actually loading it.
 *
 * Photos are served from Wikimedia's thumbnail endpoint, which renders any
 * source image at a requested pixel width. That lets one `srcSet` cover a phone
 * and a desktop without shipping a 2MB original to a 390px screen — the single
 * biggest mobile payload win available here.
 *
 * Every image also carries:
 *  - `width`/`height`, so the browser reserves the right box before the bytes
 *    arrive and the page doesn't shift as photos pop in (CLS).
 *  - `loading="lazy"` and `decoding="async"` by default, so off-screen cards
 *    cost nothing until scrolled to. The one above-the-fold image should pass
 *    `priority` to opt out.
 *  - A gradient placeholder that stays if the fetch fails, so a broken image
 *    never leaves a torn card.
 */

/** Widths requested in the srcSet. Covers 1x/2x for phones through desktop cards. */
const WIDTHS = [400, 600, 900, 1200]

export interface DestinationImageProps {
  /** Location slug, e.g. `dublin-ireland`; used to pick the photo. */
  slug: string
  alt: string
  className?: string
  /** Set on the one image above the fold so it isn't lazy-loaded. */
  priority?: boolean
  /** Layout hint for the browser's source selection. */
  sizes?: string
}

/**
 * Deterministic gradient from the slug, used as the placeholder and as the
 * permanent fallback when no photo resolves. Same slug always yields the same
 * colours, so a destination looks stable across visits.
 */
function gradientFor(slug: string): string {
  let hash = 0
  for (let i = 0; i < slug.length; i += 1) hash = (hash * 31 + slug.charCodeAt(i)) % 360
  const a = hash
  const b = (hash + 40) % 360
  return `linear-gradient(135deg, oklch(0.72 0.11 ${a}), oklch(0.55 0.13 ${b}))`
}

export function DestinationImage({
  slug,
  alt,
  className = '',
  priority = false,
  sizes = '(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 400px',
}: DestinationImageProps) {
  const [failed, setFailed] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const background = gradientFor(slug)

  // Wikimedia's Special:FilePath renders a thumbnail at the requested width.
  const src = (w: number) =>
    `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(
      slug.split('-').slice(0, -1).join(' ') || slug,
    )}.jpg?width=${w}`

  if (failed) {
    return <div role="presentation" className={className} style={{ background }} />
  }

  return (
    <div className={`relative overflow-hidden ${className}`} style={{ background }}>
      <img
        src={src(600)}
        srcSet={WIDTHS.map((w) => `${src(w)} ${w}w`).join(', ')}
        sizes={sizes}
        alt={alt}
        width={600}
        height={400}
        loading={priority ? 'eager' : 'lazy'}
        // `high` only for the hero; everything else must not compete with it.
        fetchPriority={priority ? 'high' : 'auto'}
        decoding="async"
        onLoad={() => setLoaded(true)}
        onError={() => setFailed(true)}
        className={`size-full object-cover transition-opacity duration-500 ${loaded ? 'opacity-100' : 'opacity-0'}`}
      />
    </div>
  )
}
