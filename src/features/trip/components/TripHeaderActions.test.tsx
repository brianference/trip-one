import { describe, it, expect, vi, afterEach } from 'vitest'
import { cleanup, render, screen, fireEvent } from '@testing-library/react'
import { TripHeaderActions } from './TripHeaderActions'
import type { ItineraryItem } from '../../../lib/validation/schemas'
import type { UseTripPhotosResult } from '../../photos/useTripPhotos'

const STOP_ID = '5a0b1c2d-0000-4000-8000-000000000001'

const itinerary: ItineraryItem[] = [{ time: '09:00', text: 'Trinity College', type: 'fixed', id: STOP_ID, day: 1 }]

/** A stub `useTripPhotos` result for header-action tests. */
function stubPhotos(overrides: Partial<UseTripPhotosResult> = {}): UseTripPhotosResult {
  return { byStop: new Map(), upload: vi.fn(), remove: vi.fn(), uploading: new Set(), error: null, ...overrides }
}

describe('TripHeaderActions', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('renders the joined [Print / PDF | Add photos] split pill', () => {
    render(
      <TripHeaderActions
        itinerary={itinerary}
        startDate={null}
        destinationName="Dublin, Ireland"
        demoTrip={false}
        selectedDay={1}
        photos={stubPhotos()}
      />,
    )
    expect(screen.getByRole('button', { name: 'Print / PDF' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add photos' })).toBeInTheDocument()
  })

  it('Print / PDF calls window.print', () => {
    const printSpy = vi.spyOn(window, 'print').mockImplementation(() => {})
    render(
      <TripHeaderActions
        itinerary={itinerary}
        startDate={null}
        destinationName="Dublin, Ireland"
        demoTrip={false}
        selectedDay={1}
        photos={stubPhotos()}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Print / PDF' }))
    expect(printSpy).toHaveBeenCalledTimes(1)
  })

  it('hides Add photos (and never offers the stop sheet) on a demo trip', () => {
    render(
      <TripHeaderActions
        itinerary={itinerary}
        startDate={null}
        destinationName="Dublin, Ireland"
        demoTrip={true}
        selectedDay={1}
        photos={stubPhotos()}
      />,
    )
    expect(screen.getByRole('button', { name: 'Print / PDF' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add photos' })).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('shows the calendar hint when no start date is set, and the export button once one is', () => {
    const { rerender } = render(
      <TripHeaderActions
        itinerary={itinerary}
        startDate={null}
        destinationName="Dublin, Ireland"
        demoTrip={false}
        selectedDay={1}
        photos={stubPhotos()}
      />,
    )
    expect(screen.getByText('Set a start date to add to your calendar')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add to calendar' })).not.toBeInTheDocument()

    rerender(
      <TripHeaderActions
        itinerary={itinerary}
        startDate="2026-07-18"
        destinationName="Dublin, Ireland"
        demoTrip={false}
        selectedDay={1}
        photos={stubPhotos()}
      />,
    )
    expect(screen.getByRole('button', { name: 'Add to calendar' })).toBeInTheDocument()
  })

  it('clicking Add photos opens the "Which stop is this photo for?" sheet', () => {
    render(
      <TripHeaderActions
        itinerary={itinerary}
        startDate={null}
        destinationName="Dublin, Ireland"
        demoTrip={false}
        selectedDay={1}
        photos={stubPhotos()}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Add photos' }))
    expect(screen.getByRole('dialog', { name: 'Which stop is this photo for?' })).toBeInTheDocument()
  })

  it('picking a stop and a file uploads it through photos.upload, then closes the sheet', () => {
    const upload = vi.fn()
    render(
      <TripHeaderActions
        itinerary={itinerary}
        startDate={null}
        destinationName="Dublin, Ireland"
        demoTrip={false}
        selectedDay={1}
        photos={stubPhotos({ upload })}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Add photos' }))
    const file = new File(['bytes'], 'photo.jpg', { type: 'image/jpeg' })
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(input, { target: { files: [file] } })
    expect(upload).toHaveBeenCalledWith(STOP_ID, file)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
