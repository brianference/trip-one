import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import L from 'leaflet'
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

beforeEach(() => {
  vi.clearAllMocks()
})

const location = {
  slug: 'lisbon-portugal',
  lat: 38.7,
  lng: -9.1,
  displayName: 'Lisbon, Portugal',
  thingsToDo: [
    {
      name: 'Belem Tower',
      category: 'tourist_attraction',
      source: 'places' as const,
      lat: 38.69,
      lng: -9.21,
      rating: 4.6,
      numReviews: 5000,
      placeId: 'ChIJbelem',
    },
  ],
}

describe('TripMap', () => {
  it('renders the map with no day tabs for a single-day trip', () => {
    render(<TripMap location={location} itinerary={[]} tripLengthDays={null} />)
    expect(screen.getByLabelText(/map of lisbon/i)).toBeInTheDocument()
    expect(screen.queryByRole('tab')).not.toBeInTheDocument()
  })

  it('shows day tabs for an N-day trip and selecting day N marks that day active', () => {
    const dayCount = 8
    const itinerary = Array.from({ length: dayCount }, (_, i) => ({
      time: '',
      text: `Stop day ${i + 1}`,
      type: 'option' as const,
      day: i + 1,
      lat: 38.71 + i * 0.01,
      lng: -9.13 - i * 0.01,
    }))
    // Need ≥2 stops with coords on a day for a dashed route polyline.
    itinerary.push({
      time: '',
      text: 'Stop day 8b',
      type: 'option' as const,
      day: 8,
      lat: 38.8,
      lng: -9.2,
    })
    itinerary.push(
      { time: '', text: 'Stop day 1b', type: 'option' as const, day: 1, lat: 38.715, lng: -9.135 },
    )

    render(<TripMap location={location} itinerary={itinerary} tripLengthDays={dayCount} />)

    for (let day = 1; day <= dayCount; day++) {
      expect(screen.getByRole('tab', { name: `Day ${day}` })).toBeInTheDocument()
    }
    expect(screen.getByRole('tab', { name: 'Day 1' })).toHaveAttribute('aria-selected', 'true')

    fireEvent.click(screen.getByRole('tab', { name: 'Day 8' }))
    expect(screen.getByRole('tab', { name: 'Day 8' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Day 1' })).toHaveAttribute('aria-selected', 'false')
  })

  it('draws a dashed route for the selected day and changes it when the day changes', () => {
    const itinerary = [
      { time: '', text: 'A1', type: 'option' as const, day: 1, lat: 38.71, lng: -9.13 },
      { time: '', text: 'A2', type: 'option' as const, day: 1, lat: 38.72, lng: -9.14 },
      { time: '', text: 'B1', type: 'option' as const, day: 2, lat: 38.73, lng: -9.15 },
      { time: '', text: 'B2', type: 'option' as const, day: 2, lat: 38.74, lng: -9.16 },
    ]
    render(<TripMap location={location} itinerary={itinerary} tripLengthDays={2} />)

    const leafletMocked = vi.mocked(L)
    expect(leafletMocked.polyline).toHaveBeenCalledWith(
      [
        [38.71, -9.13],
        [38.72, -9.14],
      ],
      expect.objectContaining({ dashArray: expect.any(String) }),
    )

    fireEvent.click(screen.getByRole('tab', { name: 'Day 2' }))
    expect(leafletMocked.polyline).toHaveBeenLastCalledWith(
      [
        [38.73, -9.15],
        [38.74, -9.16],
      ],
      expect.objectContaining({ dashArray: expect.any(String) }),
    )
  })

  it('renders a legend when there are markers', () => {
    render(<TripMap location={location} itinerary={[]} tripLengthDays={null} />)
    expect(screen.getByLabelText(/map pin colors/i)).toBeInTheDocument()
  })
})
