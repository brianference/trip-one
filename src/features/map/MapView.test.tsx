import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MapView } from './MapView'
import L from 'leaflet'

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

beforeEach(() => {
  vi.clearAllMocks()
})

describe('MapView', () => {
  it('renders a container with an accessible label', () => {
    render(<MapView lat={53.35} lng={-6.26} label="Dublin, Ireland" />)
    expect(screen.getByLabelText(/map of dublin, ireland/i)).toBeInTheDocument()
  })

  it('uses DOM textContent for popup to prevent XSS attacks', () => {
    const testLabel = '<img src=x onerror="alert(1)">'
    render(<MapView lat={53.35} lng={-6.26} label={testLabel} />)

    // Access the mocked Leaflet module
    const leafletMocked = vi.mocked(L)
    const markerMocked = leafletMocked.marker

    // Verify marker was called
    expect(markerMocked).toHaveBeenCalled()

    // Get the marker instance that was created
    const markerInstance = markerMocked.mock.results[0].value

    // Verify bindPopup was called with an HTMLElement, not a string
    expect(markerInstance.bindPopup).toHaveBeenCalled()
    const popupArg = markerInstance.bindPopup.mock.calls[0][0]
    expect(popupArg).toBeInstanceOf(HTMLElement)

    // Verify the element's textContent (not innerHTML) is the label
    // textContent ensures the malicious content is rendered as text, not HTML
    expect(popupArg.textContent).toBe(testLabel)
  })
})
