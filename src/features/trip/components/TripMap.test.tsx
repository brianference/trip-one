import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { TripMap } from './TripMap'

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
      marker: vi.fn(() => ({ addTo: vi.fn().mockReturnThis(), bindPopup: vi.fn().mockReturnThis(), on: vi.fn().mockReturnThis() })),
      polyline: vi.fn(() => ({ addTo: vi.fn().mockReturnThis() })),
    },
  }
})

const location = {
  slug: 'lisbon-portugal',
  lat: 38.7,
  lng: -9.1,
  displayName: 'Lisbon, Portugal',
  thingsToDo: [{ name: 'Belem Tower', category: 'tourist_attraction', source: 'places' as const, lat: 38.69, lng: -9.21 }],
}

describe('TripMap', () => {
  it('renders the map with no day tabs for a single-day trip', () => {
    render(<TripMap location={location} itinerary={[]} tripLengthDays={null} />)
    expect(screen.getByLabelText(/map of lisbon/i)).toBeInTheDocument()
    expect(screen.queryByRole('tab')).not.toBeInTheDocument()
  })

  it('shows day tabs and switches the route when a different day is selected', () => {
    const itinerary = [
      { time: '', text: 'Stop A', type: 'option' as const, day: 1, lat: 38.71, lng: -9.13 },
      { time: '', text: 'Stop B', type: 'option' as const, day: 2, lat: 38.72, lng: -9.14 },
    ]
    render(<TripMap location={location} itinerary={itinerary} tripLengthDays={2} />)
    expect(screen.getByRole('tab', { name: 'Day 1' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('tab', { name: 'Day 2' }))
    expect(screen.getByRole('tab', { name: 'Day 2' })).toHaveAttribute('aria-selected', 'true')
  })

  it('renders a legend when there are markers', () => {
    render(<TripMap location={location} itinerary={[]} tripLengthDays={null} />)
    expect(screen.getByLabelText(/map pin colors/i)).toBeInTheDocument()
  })
})
