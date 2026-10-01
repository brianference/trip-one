import { useRef } from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { StopPhotoStrip } from './StopPhotoStrip'
import { tripPhotoUrl, type TripPhoto } from './photosApi'

const photos: TripPhoto[] = [
  { id: 'p1', stopId: 'stop-1', width: 1600, height: 1200, createdAt: '2026-09-29T00:00:00.000Z' },
  { id: 'p2', stopId: 'stop-1', width: 1600, height: 1200, createdAt: '2026-09-29T00:05:00.000Z' },
]

/** Renders a real "+ Photo" stand-in next to the strip, wired the same way ItineraryEntryRow/PlaceDetailPanel wire it. */
function StripWithAddButton({ photos, onRemove }: { photos: TripPhoto[]; onRemove: (id: string) => void }) {
  const addButtonRef = useRef<HTMLButtonElement>(null)
  return (
    <>
      <button ref={addButtonRef} type="button">
        + Photo
      </button>
      <StopPhotoStrip photoUrl={(id) => tripPhotoUrl('trip-1', id)} stopName="Louvre Museum" photos={photos} onRemove={onRemove} addButtonRef={addButtonRef} />
    </>
  )
}

describe('StopPhotoStrip', () => {
  it('renders a lazy-loaded 64px thumbnail per photo, numbered in its alt text', () => {
    render(<StopPhotoStrip photoUrl={(id) => tripPhotoUrl('trip-1', id)} stopName="Louvre Museum" photos={photos} onRemove={vi.fn()} />)
    const img1 = screen.getByAltText('Photo 1 of 2 at Louvre Museum')
    const img2 = screen.getByAltText('Photo 2 of 2 at Louvre Museum')
    expect(img1).toHaveAttribute('loading', 'lazy')
    expect(img1).toHaveAttribute('src', '/api/trips/trip-1/photos/p1')
    expect(img1).toHaveAttribute('width', '64')
    expect(img1).toHaveAttribute('height', '64')
    expect(img2).toHaveAttribute('src', '/api/trips/trip-1/photos/p2')
  })

  it('renders an empty list for a stop with no photos yet', () => {
    render(<StopPhotoStrip photoUrl={(id) => tripPhotoUrl('trip-1', id)} stopName="Empty Stop" photos={[]} onRemove={vi.fn()} />)
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('asks for confirmation inline before removing — never via window.confirm', () => {
    const confirmSpy = vi.spyOn(window, 'confirm')
    const onRemove = vi.fn()
    render(<StopPhotoStrip photoUrl={(id) => tripPhotoUrl('trip-1', id)} stopName="Louvre Museum" photos={photos} onRemove={onRemove} />)

    fireEvent.click(screen.getByRole('button', { name: 'Remove photo 1 of 2 at Louvre Museum' }))
    expect(confirmSpy).not.toHaveBeenCalled()
    expect(onRemove).not.toHaveBeenCalled()
    expect(screen.getByText('Remove this photo?')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
    expect(onRemove).toHaveBeenCalledWith('p1')
  })

  it('cancelling the inline confirmation keeps the photo and restores the remove button', () => {
    const onRemove = vi.fn()
    render(<StopPhotoStrip photoUrl={(id) => tripPhotoUrl('trip-1', id)} stopName="Louvre Museum" photos={photos} onRemove={onRemove} />)

    fireEvent.click(screen.getByRole('button', { name: 'Remove photo 1 of 2 at Louvre Museum' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(onRemove).not.toHaveBeenCalled()
    expect(screen.queryByText('Remove this photo?')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remove photo 1 of 2 at Louvre Museum' })).toBeInTheDocument()
  })

  it('focuses Cancel the moment the inline confirm prompt opens', () => {
    render(<StopPhotoStrip photoUrl={(id) => tripPhotoUrl('trip-1', id)} stopName="Louvre Museum" photos={photos} onRemove={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Remove photo 1 of 2 at Louvre Museum' }))
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus()
  })

  it("returns focus to the same thumbnail's Remove button after Cancel", () => {
    render(<StopPhotoStrip photoUrl={(id) => tripPhotoUrl('trip-1', id)} stopName="Louvre Museum" photos={photos} onRemove={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Remove photo 1 of 2 at Louvre Museum' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.getByRole('button', { name: 'Remove photo 1 of 2 at Louvre Museum' })).toHaveFocus()
  })

  it("moves focus to the next thumbnail's Remove button after a delete", () => {
    render(<StopPhotoStrip photoUrl={(id) => tripPhotoUrl('trip-1', id)} stopName="Louvre Museum" photos={photos} onRemove={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Remove photo 1 of 2 at Louvre Museum' }))
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
    expect(screen.getByRole('button', { name: 'Remove photo 2 of 2 at Louvre Museum' })).toHaveFocus()
  })

  it('focuses the add-photo button after removing the only photo at a stop', () => {
    render(<StripWithAddButton photos={[photos[0]]} onRemove={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Remove photo 1 of 1 at Louvre Museum' }))
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
    expect(screen.getByRole('button', { name: '+ Photo' })).toHaveFocus()
  })

  describe('captioned variant (the stop popup)', () => {
    it('shows a visible caption under each tile, not just alt text', () => {
      render(<StopPhotoStrip photoUrl={(id) => tripPhotoUrl('trip-1', id)} stopName="Louvre Museum" photos={photos} onRemove={vi.fn()} variant="captioned" />)
      expect(screen.getByText('Photo 1 of 2 at Louvre Museum')).toBeInTheDocument()
      expect(screen.getByText('Photo 2 of 2 at Louvre Museum')).toBeInTheDocument()
      // Same text also still backs the image's alt.
      expect(screen.getByAltText('Photo 1 of 2 at Louvre Museum')).toBeInTheDocument()
    })

    it('has no stacked "Remove" text button — the corner × carries the same accessible name', () => {
      render(<StopPhotoStrip photoUrl={(id) => tripPhotoUrl('trip-1', id)} stopName="Louvre Museum" photos={photos} onRemove={vi.fn()} variant="captioned" />)
      expect(screen.queryByRole('button', { name: 'Remove' })).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Remove photo 1 of 2 at Louvre Museum' })).toBeInTheDocument()
    })

    it('the corner × opens the same inline confirm prompt', () => {
      const onRemove = vi.fn()
      render(<StopPhotoStrip photoUrl={(id) => tripPhotoUrl('trip-1', id)} stopName="Louvre Museum" photos={photos} onRemove={onRemove} variant="captioned" />)
      fireEvent.click(screen.getByRole('button', { name: 'Remove photo 1 of 2 at Louvre Museum' }))
      expect(screen.getByText('Remove this photo?')).toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
      expect(onRemove).toHaveBeenCalledWith('p1')
    })

    it('keeps the same focus management: Cancel on open, back to the same tile on cancel, next tile after delete', () => {
      render(<StopPhotoStrip photoUrl={(id) => tripPhotoUrl('trip-1', id)} stopName="Louvre Museum" photos={photos} onRemove={vi.fn()} variant="captioned" />)
      fireEvent.click(screen.getByRole('button', { name: 'Remove photo 1 of 2 at Louvre Museum' }))
      expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus()

      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
      expect(screen.getByRole('button', { name: 'Remove photo 1 of 2 at Louvre Museum' })).toHaveFocus()

      fireEvent.click(screen.getByRole('button', { name: 'Remove photo 1 of 2 at Louvre Museum' }))
      fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
      expect(screen.getByRole('button', { name: 'Remove photo 2 of 2 at Louvre Museum' })).toHaveFocus()
    })
  })
})

describe('StopPhotoStrip canRemove', () => {
  const mixed: (TripPhoto & { mine?: true })[] = [
    { id: 'p1', stopId: 's', width: 10, height: 10, createdAt: '2026-09-29T00:00:00.000Z' },
    { id: 'p2', stopId: 's', width: 10, height: 10, createdAt: '2026-09-29T00:01:00.000Z', mine: true },
    { id: 'p3', stopId: 's', width: 10, height: 10, createdAt: '2026-09-29T00:02:00.000Z', mine: true },
  ]

  /** The strip with only `mine` photos removable, plus a stand-in add button. */
  function MineOnly({ onRemove }: { onRemove: (id: string) => void }) {
    const addButtonRef = useRef<HTMLButtonElement>(null)
    return (
      <>
        <button ref={addButtonRef} type="button">
          Add photos
        </button>
        <StopPhotoStrip
          photoUrl={(id) => `/api/recap/tok/photos/${id}`}
          stopName="Louvre Museum"
          photos={mixed}
          onRemove={onRemove}
          addButtonRef={addButtonRef}
          variant="captioned"
          canRemove={(photo) => photo.mine === true}
        />
      </>
    )
  }

  it('shows every photo but a Remove control only where canRemove allows', () => {
    render(<MineOnly onRemove={vi.fn()} />)
    expect(screen.getAllByRole('img')).toHaveLength(3)
    expect(screen.getByAltText('Photo 1 of 3 at Louvre Museum')).toHaveAttribute('src', '/api/recap/tok/photos/p1')
    expect(screen.queryByRole('button', { name: 'Remove photo 1 of 3 at Louvre Museum' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Remove photo 2 of 3 at Louvre Museum' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remove photo 3 of 3 at Louvre Museum' })).toBeInTheDocument()
  })

  it('after removing the last removable photo, focus moves to the previous removable one, never a photo without the control', () => {
    const onRemove = vi.fn()
    render(<MineOnly onRemove={onRemove} />)
    fireEvent.click(screen.getByRole('button', { name: 'Remove photo 3 of 3 at Louvre Museum' }))
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
    expect(onRemove).toHaveBeenCalledWith('p3')
    expect(screen.getByRole('button', { name: 'Remove photo 2 of 3 at Louvre Museum' })).toHaveFocus()
  })
})
