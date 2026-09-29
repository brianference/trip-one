import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ItineraryDayGroup } from './ItineraryDayGroup'
import type { UseTripPhotosResult } from '../../photos/useTripPhotos'

const entries = [
  { item: { time: '09:00', text: 'Stop A', type: 'option' as const }, index: 0 },
  { item: { time: '10:00', text: 'Stop B', type: 'option' as const, id: 'stop-b-id' }, index: 1 },
]

/** A stub `useTripPhotos` result for tests that don't care about its internals. */
function stubPhotos(overrides: Partial<UseTripPhotosResult> = {}): UseTripPhotosResult {
  return { byStop: new Map(), upload: vi.fn(), remove: vi.fn(), uploading: new Set(), error: null, ...overrides }
}

const noop = {
  dayCount: 1,
  onMove: vi.fn(),
  onMoveToDay: vi.fn(),
  onSetTime: vi.fn(),
  onRemove: vi.fn(),
  photos: stubPhotos(),
  tripId: 'trip-1',
  demoTrip: false,
}

describe('ItineraryDayGroup', () => {
  it('shows a Day N heading when showHeading is true', () => {
    render(<ItineraryDayGroup {...noop} day={2} entries={entries} showHeading={true} />)
    expect(screen.getByRole('heading', { name: 'Day 2' })).toBeInTheDocument()
  })

  it('hides the heading for a single-day trip', () => {
    render(<ItineraryDayGroup {...noop} day={1} entries={entries} showHeading={false} />)
    expect(screen.queryByRole('heading', { name: 'Day 1' })).not.toBeInTheDocument()
  })

  it('forwards move/remove calls with the right entry position and index', () => {
    const onMove = vi.fn()
    const onRemove = vi.fn()
    render(<ItineraryDayGroup {...noop} day={1} entries={entries} showHeading={false} onMove={onMove} onRemove={onRemove} />)
    fireEvent.click(screen.getByRole('button', { name: /edit stop b/i }))
    fireEvent.click(screen.getByRole('button', { name: /move stop b earlier/i }))
    expect(onMove).toHaveBeenCalledWith(entries, 1, -1)
    fireEvent.click(screen.getByRole('button', { name: /remove stop a/i }))
    expect(onRemove).toHaveBeenCalledWith(0)
  })

  it('forwards set-time with the stop index', () => {
    const onSetTime = vi.fn()
    render(<ItineraryDayGroup {...noop} day={1} entries={entries} showHeading={false} onSetTime={onSetTime} />)
    fireEvent.click(screen.getByRole('button', { name: /edit stop b/i }))
    fireEvent.change(screen.getAllByLabelText('Time')[0], { target: { value: '11:15' } })
    expect(onSetTime).toHaveBeenCalledWith(1, '11:15')
  })

  it('forwards move-to-day with the stop index', () => {
    const onMoveToDay = vi.fn()
    render(<ItineraryDayGroup {...noop} dayCount={3} day={1} entries={entries} showHeading={false} onMoveToDay={onMoveToDay} />)
    fireEvent.click(screen.getByRole('button', { name: /edit stop a/i }))
    fireEvent.change(screen.getByRole('combobox', { name: /move stop a to a different day/i }), { target: { value: '3' } })
    expect(onMoveToDay).toHaveBeenCalledWith(0, 3)
  })

  it('renders an add-photo button only for the stop that has a stable id', () => {
    render(<ItineraryDayGroup {...noop} day={1} entries={entries} showHeading={false} />)
    expect(screen.queryByRole('button', { name: 'Add photo to Stop A' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add photo to Stop B' })).toBeInTheDocument()
  })

  it('uploads a chosen file to the right stop id', () => {
    const upload = vi.fn()
    render(<ItineraryDayGroup {...noop} photos={stubPhotos({ upload })} day={1} entries={entries} showHeading={false} />)
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File(['bytes'], 'photo.jpg', { type: 'image/jpeg' })
    fireEvent.change(input, { target: { files: [file] } })
    expect(upload).toHaveBeenCalledWith('stop-b-id', file)
  })

  it('hides the add-photo button on a demo trip', () => {
    render(<ItineraryDayGroup {...noop} demoTrip day={1} entries={entries} showHeading={false} />)
    expect(screen.queryByRole('button', { name: /add photo to/i })).not.toBeInTheDocument()
  })

  it("renders each stop's uploaded photos", () => {
    const photo = { id: 'p1', stopId: 'stop-b-id', width: 1600, height: 1200, createdAt: '2026-09-29T00:00:00.000Z' }
    render(
      <ItineraryDayGroup
        {...noop}
        photos={stubPhotos({ byStop: new Map([['stop-b-id', [photo]]]) })}
        day={1}
        entries={entries}
        showHeading={false}
      />,
    )
    expect(screen.getByAltText('Photo 1 of 1 at Stop B')).toBeInTheDocument()
  })
})
