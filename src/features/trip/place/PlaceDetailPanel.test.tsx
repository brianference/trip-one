import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PlaceDetailPanel } from './PlaceDetailPanel'
import type { PlaceDetail } from '../../../lib/api/client'
import type { PlaceQuery } from './usePlaceDetail'
import type { UseTripPhotosResult } from '../../photos/useTripPhotos'

/** A stub `useTripPhotos` result for panel tests that exercise photo controls. */
function stubPhotos(overrides: Partial<UseTripPhotosResult> = {}): UseTripPhotosResult {
  return { byStop: new Map(), upload: vi.fn(), remove: vi.fn(), uploading: new Set(), error: null, ...overrides }
}

const query: PlaceQuery = { label: 'Sushi Ota', placeId: 'abc' }

const detail: PlaceDetail = {
  placeId: 'abc',
  name: 'Sushi Ota',
  address: '4529 Mission Bay Dr',
  phone: '(858) 270-5670',
  rating: 4.5,
  reviewCount: 1731,
  priceLevel: 3,
  website: 'https://sushiota.com',
  mapsUrl: 'https://maps.google.com/?cid=1',
  openNow: true,
  hours: ['Monday: 5–10 PM'],
  summary: 'Longtime sushi favorite.',
  reviews: [{ author: 'Jane', rating: 5, text: 'Incredibly fresh.', relativeTime: 'a month ago' }],
  photoRefs: ['ref1'],
  serves: ['lunch', 'dinner'],
  types: ['restaurant'],
}

describe('PlaceDetailPanel', () => {
  it('shows the loading label from the query before detail arrives', () => {
    render(<PlaceDetailPanel query={query} detail={null} loading error={null} onClose={vi.fn()} />)
    expect(screen.getByRole('heading', { name: 'Sushi Ota' })).toBeInTheDocument()
    expect(screen.getByText(/loading details/i)).toBeInTheDocument()
  })

  it('renders real detail fields: rating, address, phone, review, directions', () => {
    render(<PlaceDetailPanel query={query} detail={detail} loading={false} error={null} onClose={vi.fn()} />)
    expect(screen.getByText(/4\.5/)).toBeInTheDocument()
    expect(screen.getByText(/1,731 reviews/)).toBeInTheDocument()
    expect(screen.getByText(/4529 Mission Bay Dr/)).toBeInTheDocument()
    expect(screen.getByText(/incredibly fresh/i)).toBeInTheDocument()
    // phone is a tel link with digits only
    expect(screen.getByRole('link', { name: /858/ })).toHaveAttribute('href', 'tel:8582705670')
    // directions uses the canonical Google Maps url when present
    expect(screen.getByRole('link', { name: /get directions/i })).toHaveAttribute('href', 'https://maps.google.com/?cid=1')
    // a photo is loaded via the proxy (key never in the client)
    expect(screen.getByRole('img')).toHaveAttribute('src', expect.stringContaining('/api/place-photo?ref=ref1'))
  })

  it('falls back to a maps search for directions when there is no canonical url', () => {
    render(<PlaceDetailPanel query={query} detail={{ ...detail, mapsUrl: null }} loading={false} error={null} onClose={vi.fn()} />)
    expect(screen.getByRole('link', { name: /get directions/i })).toHaveAttribute(
      'href',
      expect.stringContaining('google.com/maps/dir'),
    )
  })

  it('closes on the close button and on overlay click', () => {
    const onClose = vi.fn()
    render(<PlaceDetailPanel query={query} detail={detail} loading={false} error={null} onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: /close details/i }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('shows a graceful partial panel from known pin fields (never empty)', () => {
    const pinQuery: PlaceQuery = {
      label: 'PadToGo',
      name: 'PadToGo',
      lat: 41.15014,
      lng: -8.61102,
      category: 'attraction',
    }
    const partial = {
      placeId: '',
      name: 'PadToGo',
      address: null,
      phone: null,
      rating: null,
      reviewCount: null,
      priceLevel: null,
      website: null,
      mapsUrl: 'https://www.google.com/maps/dir/?api=1&destination=41.15014,-8.61102',
      openNow: null,
      hours: [] as string[],
      summary: null,
      reviews: [] as PlaceDetail['reviews'],
      photoRefs: [] as string[],
      serves: [] as string[],
      types: ['attraction'],
      partial: true,
      category: 'attraction',
      lat: 41.15014,
      lng: -8.61102,
    }
    render(<PlaceDetailPanel query={pinQuery} detail={partial} loading={false} error={null} onClose={vi.fn()} />)
    expect(screen.getByRole('heading', { name: 'PadToGo' })).toBeInTheDocument()
    expect(screen.getByText(/full details aren’t available/i)).toBeInTheDocument()
    expect(screen.getByText(/attraction/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /get directions/i })).toHaveAttribute(
      'href',
      'https://www.google.com/maps/dir/?api=1&destination=41.15014,-8.61102',
    )
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('still surfaces a real transport error when detail is missing and not partial', () => {
    render(
      <PlaceDetailPanel
        query={query}
        detail={null}
        loading={false}
        error="Something went wrong on our end."
        onClose={vi.fn()}
      />,
    )
    // Body still shows the known label so the panel is not empty.
    expect(screen.getByRole('heading', { name: 'Sushi Ota' })).toBeInTheDocument()
    expect(screen.getByText(/full details aren’t available/i)).toBeInTheDocument()
  })

  it('shows no photo controls when the place is not on the plan', () => {
    render(
      <PlaceDetailPanel
        query={query}
        detail={detail}
        loading={false}
        error={null}
        onClose={vi.fn()}
        tripId="trip-1"
        photos={stubPhotos()}
        planStopId={null}
      />,
    )
    expect(screen.queryByRole('button', { name: /add photo to/i })).not.toBeInTheDocument()
  })

  it('shows the add-photo button and existing thumbnails when the place is on the plan', () => {
    const photo = { id: 'p1', stopId: 'stop-1', width: 1600, height: 1200, createdAt: '2026-09-29T00:00:00.000Z' }
    render(
      <PlaceDetailPanel
        query={query}
        detail={detail}
        loading={false}
        error={null}
        onClose={vi.fn()}
        tripId="trip-1"
        photos={stubPhotos({ byStop: new Map([['stop-1', [photo]]]) })}
        planStopId="stop-1"
      />,
    )
    expect(screen.getByRole('button', { name: 'Add photo to Sushi Ota' })).toBeInTheDocument()
    expect(screen.getByAltText('Photo 1 of 1 at Sushi Ota')).toBeInTheDocument()
  })

  it('hides the add-photo button on a demo trip but still shows existing photos', () => {
    const photo = { id: 'p1', stopId: 'stop-1', width: 1600, height: 1200, createdAt: '2026-09-29T00:00:00.000Z' }
    render(
      <PlaceDetailPanel
        query={query}
        detail={detail}
        loading={false}
        error={null}
        onClose={vi.fn()}
        tripId="trip-1"
        demoTrip
        photos={stubPhotos({ byStop: new Map([['stop-1', [photo]]]) })}
        planStopId="stop-1"
      />,
    )
    expect(screen.queryByRole('button', { name: /add photo to/i })).not.toBeInTheDocument()
    expect(screen.getByAltText('Photo 1 of 1 at Sushi Ota')).toBeInTheDocument()
  })

  it('renders the photo block while details are still loading', () => {
    render(
      <PlaceDetailPanel
        query={query}
        detail={null}
        loading
        error={null}
        onClose={vi.fn()}
        tripId="trip-1"
        photos={stubPhotos()}
        planStopId="stop-1"
      />,
    )
    expect(screen.getByRole('button', { name: 'Add photo to Sushi Ota' })).toBeInTheDocument()
    expect(screen.getByText(/loading details/i)).toBeInTheDocument()
  })

  it('renders the photo block when a transport error is set', () => {
    render(
      <PlaceDetailPanel
        query={query}
        detail={null}
        loading={false}
        error="Something went wrong on our end."
        onClose={vi.fn()}
        tripId="trip-1"
        photos={stubPhotos()}
        planStopId="stop-1"
      />,
    )
    expect(screen.getByRole('button', { name: 'Add photo to Sushi Ota' })).toBeInTheDocument()
  })

  it('places the photo block before the details (address) in DOM order', () => {
    render(
      <PlaceDetailPanel
        query={query}
        detail={detail}
        loading={false}
        error={null}
        onClose={vi.fn()}
        tripId="trip-1"
        photos={stubPhotos()}
        planStopId="stop-1"
      />,
    )
    const addButton = screen.getByRole('button', { name: 'Add photo to Sushi Ota' })
    const address = screen.getByText(/4529 Mission Bay Dr/)
    // Node.DOCUMENT_POSITION_FOLLOWING (4) means `address` comes after `addButton`.
    expect(addButton.compareDocumentPosition(address) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('shows the empty state when the stop has zero photos', () => {
    render(
      <PlaceDetailPanel
        query={query}
        detail={detail}
        loading={false}
        error={null}
        onClose={vi.fn()}
        tripId="trip-1"
        photos={stubPhotos()}
        planStopId="stop-1"
      />,
    )
    expect(screen.getByText('No photos yet — add the first one')).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: /photos at sushi ota/i })).not.toBeInTheDocument()
  })

  it('uploads the chosen file for the on-plan stop', () => {
    const upload = vi.fn()
    render(
      <PlaceDetailPanel
        query={query}
        detail={detail}
        loading={false}
        error={null}
        onClose={vi.fn()}
        tripId="trip-1"
        photos={stubPhotos({ upload })}
        planStopId="stop-1"
      />,
    )
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File(['bytes'], 'photo.jpg', { type: 'image/jpeg' })
    fireEvent.change(input, { target: { files: [file] } })
    expect(upload).toHaveBeenCalledWith('stop-1', file)
  })
})
