import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MapView } from './MapView'

vi.mock('leaflet', () => {
  const createMapMock = () => {
    const mapMock = { remove: vi.fn() }
    mapMock.setView = vi.fn(() => mapMock)
    return mapMock
  }

  return {
    default: {
      map: vi.fn(createMapMock),
      tileLayer: vi.fn(() => ({ addTo: vi.fn() })),
      marker: vi.fn(() => ({ addTo: vi.fn().mockReturnThis(), bindPopup: vi.fn().mockReturnThis() })),
    },
  }
})

describe('MapView', () => {
  it('renders a container with an accessible label', () => {
    render(<MapView lat={53.35} lng={-6.26} label="Dublin, Ireland" />)
    expect(screen.getByLabelText(/map of dublin, ireland/i)).toBeInTheDocument()
  })
})
