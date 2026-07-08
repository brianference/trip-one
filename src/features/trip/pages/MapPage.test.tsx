import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MapPage } from './MapPage'
import { useTripStore } from '../../../store/tripStore'

vi.mock('leaflet', () => {
  const createMapMock = () => {
    const mapMock: { remove: ReturnType<typeof vi.fn>; setView: ReturnType<typeof vi.fn>; fitBounds: ReturnType<typeof vi.fn> } = {
      remove: vi.fn(),
      setView: vi.fn(),
      fitBounds: vi.fn(),
    }
    mapMock.setView = vi.fn(() => mapMock)
    return mapMock
  }
  return {
    default: {
      map: vi.fn(createMapMock),
      tileLayer: vi.fn(() => ({ addTo: vi.fn() })),
      divIcon: vi.fn(() => ({})),
      marker: vi.fn(() => ({ addTo: vi.fn().mockReturnThis(), bindPopup: vi.fn().mockReturnThis() })),
      polyline: vi.fn(() => ({ addTo: vi.fn().mockReturnThis() })),
    },
  }
})

let outletContext: unknown

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return { ...actual, useOutletContext: () => outletContext }
})

describe('MapPage', () => {
  it('shows a loading message while the location has not resolved yet', () => {
    outletContext = { trip: { id: 't1', locationSlug: 'tokyo-japan', itinerary: [], designStyle: 'chronicle' }, location: null }
    render(<MapPage />)
    expect(screen.getByText(/loading map/i)).toBeInTheDocument()
  })

  it('renders the map once the location has resolved', () => {
    outletContext = {
      trip: { id: 't1', locationSlug: 'tokyo-japan', itinerary: [], designStyle: 'chronicle' },
      location: { slug: 'tokyo-japan', lat: 35.68, lng: 139.76, displayName: 'Tokyo, Japan', thingsToDo: [] },
    }
    useTripStore.setState({ itinerary: [], tripLengthDays: null })
    render(<MapPage />)
    expect(screen.getByLabelText(/map of tokyo/i)).toBeInTheDocument()
  })
})
