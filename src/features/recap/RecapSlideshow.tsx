import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import type { RecapSlide } from './buildRecap'
import { usePrefersReducedMotion } from '../../hooks/usePrefersReducedMotion'

/** How long each photo stays up during autoplay. */
export const SLIDE_INTERVAL_MS = 4000

/** What the owner sees in place of the slideshow when the trip has no photos yet. */
export const NO_PHOTOS_OWNER_MESSAGE = 'No photos yet. Add photos to your stops on the Plan page.'

/** One slide plus its photo's stored pixel size, so the `<img>` can reserve its box before it loads. */
export interface SlideshowSlide extends RecapSlide {
  width: number
  height: number
}

interface Props {
  /** Every photo in trip order (`Recap['slides']` with each photo's size). */
  slides: SlideshowSlide[]
  /** The `<img src>` for a photo: the owner and public routes serve photo bytes from different URLs. */
  photoUrl: (photoId: string) => string
  /** `owner` shows an add-photos hint when there are no slides; `public` renders nothing then. */
  variant: 'owner' | 'public'
  /** Whether autoplay is on (controlled, so a parent can make it yield to the map walkthrough). */
  playing: boolean
  /** Called when the Play/Pause button is pressed, or autoplay reaches the last slide and stops. */
  onPlayingChange: (playing: boolean) => void
  /**
   * The stop the page is currently on, driven from outside (the map). When it
   * changes to a stop other than the current slide's, the slideshow jumps to
   * that stop's first photo; a stop with no photos is ignored. Such a jump is
   * not reported back through `onSlideChange`.
   */
  activeStopId: string | null
  /** Called with the new slide's stop id whenever the user or autoplay moves to another slide, so the map follows along. */
  onSlideChange: (stopId: string) => void
}

/**
 * The trip's photos as a one-at-a-time slideshow, in itinerary order.
 *
 * Previous/Next buttons and ArrowLeft/ArrowRight (on the focused slide) move
 * one photo. Autoplay advances every {@link SLIDE_INTERVAL_MS}, stops at the
 * last photo, and holds while the pointer is over the slide or keyboard
 * focus is on it (WCAG 2.2.2). Under prefers-reduced-motion there is no
 * autoplay and no Play control at all.
 */
export function RecapSlideshow({ slides, photoUrl, variant, playing, onPlayingChange, activeStopId, onSlideChange }: Props) {
  const reducedMotion = usePrefersReducedMotion()
  const [index, setIndex] = useState(0)
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)

  const lastIndex = slides.length - 1
  // A photo removed while the page is open can leave the index past the end.
  const current = Math.min(index, Math.max(lastIndex, 0))
  const currentRef = useRef(current)
  currentRef.current = current
  const slidesRef = useRef(slides)
  slidesRef.current = slides
  const onSlideChangeRef = useRef(onSlideChange)
  onSlideChangeRef.current = onSlideChange
  const onPlayingChangeRef = useRef(onPlayingChange)
  onPlayingChangeRef.current = onPlayingChange

  const autoplaying = playing && !reducedMotion && !hovered && !focused && slides.length > 1

  /** Moves to `next` (clamped) and reports its stop when it's a real move. */
  function goTo(next: number) {
    const currentSlides = slidesRef.current
    const clamped = Math.min(Math.max(next, 0), currentSlides.length - 1)
    if (clamped === currentRef.current || clamped < 0) return
    setIndex(clamped)
    currentRef.current = clamped
    onSlideChangeRef.current(currentSlides[clamped].stopId)
  }

  // Autoplay: one timer per slide, restarted by any move (keyed on
  // `current`), so a manual Next never gets cut short by a timer that was
  // already running, and an unrelated parent re-render never resets it.
  useEffect(() => {
    if (!autoplaying) return
    const timer = setTimeout(() => {
      if (currentRef.current >= slidesRef.current.length - 1) {
        onPlayingChangeRef.current(false)
        return
      }
      goTo(currentRef.current + 1)
    }, SLIDE_INTERVAL_MS)
    return () => clearTimeout(timer)
  }, [autoplaying, current])

  // Follow the map: jump to the first photo of an externally chosen stop.
  useEffect(() => {
    if (activeStopId === null) return
    const currentSlides = slidesRef.current
    if (currentSlides[currentRef.current]?.stopId === activeStopId) return
    const target = currentSlides.findIndex((slide) => slide.stopId === activeStopId)
    if (target === -1) return
    setIndex(target)
    currentRef.current = target
  }, [activeStopId])

  /** Play restarts from the first photo when the slideshow already sits on the last one. */
  function togglePlaying() {
    if (playing) {
      onPlayingChange(false)
      return
    }
    if (currentRef.current >= lastIndex) {
      setIndex(0)
      currentRef.current = 0
      onSlideChange(slides[0].stopId)
    }
    onPlayingChange(true)
  }

  /** ArrowLeft/ArrowRight on the focused slide region. */
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'ArrowRight') {
      event.preventDefault()
      goTo(currentRef.current + 1)
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault()
      goTo(currentRef.current - 1)
    }
  }

  if (slides.length === 0) {
    return variant === 'owner' ? <p className="chronicle-rate-line">{NO_PHOTOS_OWNER_MESSAGE}</p> : null
  }

  const slide = slides[current]
  const caption = `Day ${slide.day} · Stop ${slide.stopOrder} · ${slide.stopText}`

  return (
    <div className="chronicle-recap-slideshow">
      <div
        role="region"
        aria-label="Photo slideshow"
        aria-roledescription="slideshow"
        tabIndex={0}
        className="chronicle-recap-slide"
        onKeyDown={onKeyDown}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        // Announce each new photo only when the user moved it; a live region
        // that talks every few seconds on its own drowns everything else out.
        aria-live={autoplaying ? 'off' : 'polite'}
      >
        <figure className="chronicle-recap-slide-figure">
          <div className="chronicle-recap-slide-frame">
            <img
              key={slide.photoId}
              src={photoUrl(slide.photoId)}
              alt={`${slide.stopText}, day ${slide.day}`}
              width={slide.width}
              height={slide.height}
              className="chronicle-recap-slide-img"
            />
          </div>
          <figcaption className="chronicle-recap-slide-caption">{caption}</figcaption>
        </figure>
        <p className="chronicle-recap-slide-count">
          Photo {current + 1} of {slides.length}
        </p>
      </div>
      <div className="chronicle-recap-controls">
        {/* aria-disabled rather than disabled: a real disabled button drops
            keyboard focus the moment it reaches the first/last photo. */}
        <button
          type="button"
          className="chronicle-recap-btn"
          onClick={() => goTo(current - 1)}
          aria-disabled={current === 0}
        >
          Previous photo
        </button>
        {!reducedMotion && slides.length > 1 && (
          <button type="button" className="chronicle-recap-btn" onClick={togglePlaying} aria-pressed={playing}>
            {playing ? 'Pause slideshow' : 'Play slideshow'}
          </button>
        )}
        <button
          type="button"
          className="chronicle-recap-btn"
          onClick={() => goTo(current + 1)}
          aria-disabled={current === lastIndex}
        >
          Next photo
        </button>
      </div>
    </div>
  )
}
