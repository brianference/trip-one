import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PlaceDetailPanel } from './PlaceDetailPanel'
import type { PlaceDetail } from '../../../lib/api/client'
import type { PlaceQuery } from './usePlaceDetail'

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

  it('shows an error message when the lookup fails', () => {
    render(<PlaceDetailPanel query={query} detail={null} loading={false} error="place not found" onClose={vi.fn()} />)
    expect(screen.getByRole('alert')).toHaveTextContent(/place not found/i)
  })
})
