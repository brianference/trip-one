import { useState } from 'react'

/**
 * Destination imagery, sized for the device that's actually loading it.
 *
 * An earlier version built Wikimedia URLs by guessing a filename from the
 * destination slug. QA found that only three of eight guesses resolved to a
 * real photo — the rest returned an HTML error page that the browser could not
 * render — so images are now CURATED per destination and verified, and anything
 * without a curated photo falls back to a generated gradient rather than a
 * broken image.
 *
 * Every image carries:
 *  - `srcSet`/`sizes`, so a 390px phone fetches a 400px-wide file rather than
 *    a desktop-sized original. The single biggest mobile payload win here.
 *  - `width`/`height`, so the browser reserves the box before the bytes land
 *    and the page doesn't shift as photos appear.
 *  - `loading="lazy"` and `decoding="async"` by default; the one image above
 *    the fold should pass `priority` to opt out.
 */

/** Widths requested in the srcSet, covering 1x/2x from phone to desktop card. */
const WIDTHS = [400, 600, 960]

/**
 * Verified Wikimedia Commons filenames, keyed by destination slug. Each one was
 * checked to return a real `image/jpeg`; a guessed filename is worse than no
 * photo, because it renders as a broken image rather than a clean fallback.
 */
const CURATED: Record<string, string> = {
  'dublin-ireland': 'City_Quay,_Dublin,_Ireland_-_geograph.org.uk_-_2561034.jpg',
  'jackson-wyoming': 'Jackson_Hole_Monument.jpg',
  'kyoto-japan':
    'Four_ladies_wearing_a_yukata_in_front_of_the_North_Gate_of_Kiyomizu-dera_temple_Kyoto_Japan.jpg',
  'lisbon-portugal': 'Eborense_ferry_at_sunset,_Estação_Fluvial_de_Belém,_Lisbon,_Portugal_julesvernex2.jpg',
  'new-orleans-louisiana': 'Bourbon_St,_French_Quarter,_New_Orleans,_USA2.jpg',
  'queenstown-new-zealand': 'Lake_Wakatipu_from_Queenstown_gondola.jpg',
  'marrakech-morocco': 'Lamp_maker,_Medina_of_Marrakech.jpg',
  'banff-canada': 'Banff_Ave,_Banff,_south_view_20240820_1.jpg',
}

/**
 * Builds a Commons thumbnail URL at an arbitrary width.
 *
 * Uses `Special:FilePath?width=`, not a direct `upload.wikimedia.org/thumb/`
 * path. Direct thumb paths only serve widths that happen to be pre-generated —
 * measured on one file, 500 and 960 returned an image while 200, 320, 400, 480,
 * 640, 800 and 1024 all returned HTTP 400. Special:FilePath renders any width
 * and redirects to the rendered file, which is what makes a real srcSet
 * possible.
 */
function srcFor(file: string, width: number): string {
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file)}?width=${width}`
}

export interface DestinationImageProps {
  /** Location slug, e.g. `dublin-ireland`. */
  slug: string
  alt: string
  className?: string
  /** Set on the one image above the fold so it isn't lazy-loaded. */
  priority?: boolean
  /** Layout hint for the browser's source selection. */
  sizes?: string
}

/**
 * Deterministic gradient from the slug, used as the loading placeholder and as
 * the permanent fallback for destinations with no curated photo. The same slug
 * always yields the same colours, so a destination looks stable across visits.
 */
function gradientFor(slug: string): string {
  let hash = 0
  for (let i = 0; i < slug.length; i += 1) hash = (hash * 31 + slug.charCodeAt(i)) % 360
  return `linear-gradient(135deg, oklch(0.72 0.11 ${hash}), oklch(0.55 0.13 ${(hash + 40) % 360}))`
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
  const path = CURATED[slug]

  // No curated photo, or the fetch failed: the gradient is the final state.
  // It reads as a deliberate colour block rather than a broken image.
  if (!path || failed) {
    return <div role="presentation" aria-hidden="true" className={className} style={{ background }} />
  }

  return (
    <div className={`relative overflow-hidden ${className}`} style={{ background }}>
      <img
        src={srcFor(path, 600)}
        srcSet={WIDTHS.map((w) => `${srcFor(path, w)} ${w}w`).join(', ')}
        sizes={sizes}
        alt={alt}
        width={600}
        height={400}
        loading={priority ? 'eager' : 'lazy'}
        fetchPriority={priority ? 'high' : 'auto'}
        decoding="async"
        onLoad={() => setLoaded(true)}
        onError={() => setFailed(true)}
        className={`size-full object-cover transition-opacity duration-500 ${loaded ? 'opacity-100' : 'opacity-0'}`}
      />
    </div>
  )
}
