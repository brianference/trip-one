import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { useState } from 'react'
import { RecapSlideshow, SLIDE_INTERVAL_MS, type SlideshowSlide } from './RecapSlideshow'

/** Synthetic unit-test slides (never rendered in the product). */
const slides: SlideshowSlide[] = [
  { photoId: 'p1', stopId: 'a', day: 1, stopText: 'Shibuya Crossing', stopOrder: 1, width: 1600, height: 1200 },
  { photoId: 'p2', stopId: 'a', day: 1, stopText: 'Shibuya Crossing', stopOrder: 1, width: 1200, height: 1600 },
  { photoId: 'p3', stopId: 'e', day: 2, stopText: 'Senso-ji', stopOrder: 5, width: 1600, height: 900 },
]

/** Stubs `matchMedia` so only the reduced-motion query matches, and only when asked. */
function stubMatchMedia(reduceMotion: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches: query.includes('prefers-reduced-motion') ? reduceMotion : false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  )
}

/** Hosts the slideshow with real `playing` state, the way RecapView does. */
function Harness({
  initialPlaying = false,
  activeStopId = null,
  onSlideChange = vi.fn(),
  variant = 'owner',
  items = slides,
}: {
  initialPlaying?: boolean
  activeStopId?: string | null
  onSlideChange?: (stopId: string) => void
  variant?: 'owner' | 'public'
  items?: SlideshowSlide[]
}) {
  const [playing, setPlaying] = useState(initialPlaying)
  return (
    <RecapSlideshow
      slides={items}
      photoUrl={(id) => `/photos/${id}`}
      variant={variant}
      playing={playing}
      onPlayingChange={setPlaying}
      activeStopId={activeStopId}
      onSlideChange={onSlideChange}
    />
  )
}

/** The focusable slide region that takes arrow keys. */
function slideRegion() {
  return screen.getByRole('region', { name: 'Photo slideshow' })
}

beforeEach(() => stubMatchMedia(false))
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('RecapSlideshow', () => {
  it('shows one slide with a "Day N · Stop N · name" caption, sized to prevent layout shift', () => {
    render(<Harness items={[slides[2]]} />)
    expect(screen.getAllByRole('img')).toHaveLength(1)
    expect(screen.getByText('Day 2 · Stop 5 · Senso-ji')).toBeInTheDocument()
    const img = screen.getByRole('img', { name: 'Senso-ji, day 2' })
    expect(img).toHaveAttribute('src', '/photos/p3')
    expect(img).toHaveAttribute('width', '1600')
    expect(img).toHaveAttribute('height', '900')
  })

  it('Next and Previous are buttons that move one slide and report the stop', () => {
    const onSlideChange = vi.fn()
    render(<Harness onSlideChange={onSlideChange} />)
    expect(screen.getByText('Photo 1 of 3')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Next photo' }))
    expect(screen.getByText('Photo 2 of 3')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Next photo' }))
    expect(screen.getByText('Day 2 · Stop 5 · Senso-ji')).toBeInTheDocument()
    expect(onSlideChange).toHaveBeenLastCalledWith('e')
    fireEvent.click(screen.getByRole('button', { name: 'Previous photo' }))
    expect(screen.getByText('Photo 2 of 3')).toBeInTheDocument()
    expect(onSlideChange).toHaveBeenLastCalledWith('a')
  })

  it('ArrowRight and ArrowLeft move slides when the slide region is focused', () => {
    render(<Harness />)
    const region = slideRegion()
    region.focus()
    expect(region).toHaveFocus()
    fireEvent.keyDown(region, { key: 'ArrowRight' })
    expect(screen.getByText('Photo 2 of 3')).toBeInTheDocument()
    fireEvent.keyDown(region, { key: 'ArrowRight' })
    expect(screen.getByText('Photo 3 of 3')).toBeInTheDocument()
    fireEvent.keyDown(region, { key: 'ArrowRight' }) // already last: stays
    expect(screen.getByText('Photo 3 of 3')).toBeInTheDocument()
    fireEvent.keyDown(region, { key: 'ArrowLeft' })
    expect(screen.getByText('Photo 2 of 3')).toBeInTheDocument()
  })

  it(`autoplay advances every ${SLIDE_INTERVAL_MS} ms, and stops at the last slide`, () => {
    expect(SLIDE_INTERVAL_MS).toBe(4000)
    vi.useFakeTimers()
    const onSlideChange = vi.fn()
    render(<Harness initialPlaying onSlideChange={onSlideChange} />)
    expect(screen.getByRole('button', { name: 'Pause slideshow' })).toBeInTheDocument()

    act(() => vi.advanceTimersByTime(SLIDE_INTERVAL_MS - 1))
    expect(screen.getByText('Photo 1 of 3')).toBeInTheDocument()
    act(() => vi.advanceTimersByTime(1))
    expect(screen.getByText('Photo 2 of 3')).toBeInTheDocument()
    act(() => vi.advanceTimersByTime(SLIDE_INTERVAL_MS))
    expect(screen.getByText('Photo 3 of 3')).toBeInTheDocument()
    expect(onSlideChange).toHaveBeenLastCalledWith('e')

    act(() => vi.advanceTimersByTime(SLIDE_INTERVAL_MS))
    expect(screen.getByText('Photo 3 of 3')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Play slideshow' })).toBeInTheDocument()
  })

  it('the Pause button stops autoplay, and Play resumes it', () => {
    vi.useFakeTimers()
    render(<Harness initialPlaying />)
    fireEvent.click(screen.getByRole('button', { name: 'Pause slideshow' }))
    act(() => vi.advanceTimersByTime(SLIDE_INTERVAL_MS * 3))
    expect(screen.getByText('Photo 1 of 3')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Play slideshow' }))
    act(() => vi.advanceTimersByTime(SLIDE_INTERVAL_MS))
    expect(screen.getByText('Photo 2 of 3')).toBeInTheDocument()
  })

  it('hovering the slide pauses autoplay until the pointer leaves', () => {
    vi.useFakeTimers()
    render(<Harness initialPlaying />)
    fireEvent.mouseEnter(slideRegion())
    act(() => vi.advanceTimersByTime(SLIDE_INTERVAL_MS * 3))
    expect(screen.getByText('Photo 1 of 3')).toBeInTheDocument()
    fireEvent.mouseLeave(slideRegion())
    act(() => vi.advanceTimersByTime(SLIDE_INTERVAL_MS))
    expect(screen.getByText('Photo 2 of 3')).toBeInTheDocument()
  })

  it('keyboard focus on the slide pauses autoplay until focus leaves', () => {
    vi.useFakeTimers()
    render(<Harness initialPlaying />)
    act(() => slideRegion().focus())
    act(() => vi.advanceTimersByTime(SLIDE_INTERVAL_MS * 3))
    expect(screen.getByText('Photo 1 of 3')).toBeInTheDocument()
    act(() => slideRegion().blur())
    act(() => vi.advanceTimersByTime(SLIDE_INTERVAL_MS))
    expect(screen.getByText('Photo 2 of 3')).toBeInTheDocument()
  })

  it('with reduced motion there is no autoplay and no Play control', () => {
    stubMatchMedia(true)
    vi.useFakeTimers()
    render(<Harness initialPlaying />)
    act(() => vi.advanceTimersByTime(SLIDE_INTERVAL_MS * 3))
    expect(screen.getByText('Photo 1 of 3')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /slideshow/ })).toBeNull()
    // Manual navigation still works.
    fireEvent.click(screen.getByRole('button', { name: 'Next photo' }))
    expect(screen.getByText('Photo 2 of 3')).toBeInTheDocument()
  })

  it("follows an external activeStopId to that stop's first slide, without echoing it back", () => {
    const onSlideChange = vi.fn()
    const { rerender } = render(<Harness onSlideChange={onSlideChange} activeStopId={null} />)
    rerender(<Harness onSlideChange={onSlideChange} activeStopId="e" />)
    expect(screen.getByText('Photo 3 of 3')).toBeInTheDocument()
    rerender(<Harness onSlideChange={onSlideChange} activeStopId="a" />)
    expect(screen.getByText('Photo 1 of 3')).toBeInTheDocument()
    // A stop with no photos leaves the slide where it is.
    rerender(<Harness onSlideChange={onSlideChange} activeStopId="no-photos" />)
    expect(screen.getByText('Photo 1 of 3')).toBeInTheDocument()
    expect(onSlideChange).not.toHaveBeenCalled()
  })

  it('with zero slides shows the add-photos hint in the owner view', () => {
    render(<Harness items={[]} variant="owner" />)
    expect(screen.getByText('No photos yet. Add photos to your stops on the Plan page.')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Photo slideshow' })).toBeNull()
  })

  it('with zero slides renders nothing in the public view', () => {
    const { container } = render(<Harness items={[]} variant="public" />)
    expect(container).toBeEmptyDOMElement()
  })
})
