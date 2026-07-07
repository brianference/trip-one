import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MapView } from './MapView'
import L from 'leaflet'

vi.mock('leaflet', () => {
  const createMapMock = () => {
    const mapMock: {
      remove: ReturnType<typeof vi.fn>
      setView: ReturnType<typeof vi.fn>
      fitBounds: ReturnType<typeof vi.fn>
    } = {
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
      divIcon: vi.fn(() => ({ __mockDivIcon: true })),
      marker: vi.fn(() => ({ addTo: vi.fn().mockReturnThis(), bindPopup: vi.fn().mockReturnThis() })),
      polyline: vi.fn(() => ({ addTo: vi.fn().mockReturnThis() })),
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

  it('uses a custom divIcon instead of Leaflet default marker images (avoids broken image requests)', () => {
    render(<MapView lat={53.35} lng={-6.26} label="Dublin, Ireland" />)

    const leafletMocked = vi.mocked(L)

    // A divIcon must be built (no dependency on Leaflet's bundled marker-icon.png/
    // marker-shadow.png assets, which 404 under this app's SPA routing).
    expect(leafletMocked.divIcon).toHaveBeenCalledTimes(1)
    const divIconCall = leafletMocked.divIcon.mock.calls[0][0]
    expect(divIconCall?.html).toBeTruthy()

    // The marker must be constructed with that custom icon, not Leaflet's default.
    const divIconResult = leafletMocked.divIcon.mock.results[0].value
    expect(leafletMocked.marker).toHaveBeenCalledWith([53.35, -6.26], { icon: divIconResult })
  })

  it('renders the base location marker plus one colored marker per entry in the markers prop', () => {
    render(
      <MapView
        lat={35.68}
        lng={139.76}
        label="Tokyo, Japan"
        markers={[
          { lat: 35.6595, lng: 139.7005, label: 'Shibuya Crossing', category: 'tourist_attraction' },
          { lat: 35.7148, lng: 139.7967, label: 'Ueno Park', category: 'park' },
        ]}
      />,
    )

    const leafletMocked = vi.mocked(L)

    // 1 base marker (city center) + 2 things-to-do markers
    expect(leafletMocked.marker).toHaveBeenCalledTimes(3)
    expect(leafletMocked.marker).toHaveBeenNthCalledWith(1, [35.68, 139.76], expect.anything())
    expect(leafletMocked.marker).toHaveBeenNthCalledWith(2, [35.6595, 139.7005], expect.anything())
    expect(leafletMocked.marker).toHaveBeenNthCalledWith(3, [35.7148, 139.7967], expect.anything())

    // Each marker gets its own divIcon, and different categories get different colors.
    expect(leafletMocked.divIcon).toHaveBeenCalledTimes(3)
    const htmlArgs = leafletMocked.divIcon.mock.calls.map((call) => call[0]?.html)
    expect(new Set(htmlArgs).size).toBe(3)
  })

  it('does not render any extra markers when markers is an empty array', () => {
    render(<MapView lat={35.68} lng={139.76} label="Tokyo, Japan" markers={[]} />)
    const leafletMocked = vi.mocked(L)
    expect(leafletMocked.marker).toHaveBeenCalledTimes(1)
  })

  it('fits the map to a real bounding box (e.g. a whole country) instead of a fixed zoom', () => {
    render(
      <MapView
        lat={18.18}
        lng={-77.39}
        label="Jamaica"
        boundingBox={[16.5899443, 18.7256394, -78.5782366, -75.7541143]}
      />,
    )
    const leafletMocked = vi.mocked(L)
    const mapInstance = leafletMocked.map.mock.results[0].value
    expect(mapInstance.fitBounds).toHaveBeenCalledWith(
      [
        [16.5899443, -78.5782366],
        [18.7256394, -75.7541143],
      ],
      { animate: false },
    )
  })

  it('ignores a near-point-sized bounding box and keeps the fixed default zoom', () => {
    render(<MapView lat={53.35} lng={-6.26} label="A single address" boundingBox={[53.349, 53.351, -6.261, -6.259]} />)
    const leafletMocked = vi.mocked(L)
    const mapInstance = leafletMocked.map.mock.results[0].value
    expect(mapInstance.fitBounds).not.toHaveBeenCalled()
  })

  it('draws a dashed route line connecting stops in visit order', () => {
    render(
      <MapView
        lat={35.68}
        lng={139.76}
        label="Tokyo, Japan"
        route={[
          { lat: 35.66, lng: 139.7 },
          { lat: 35.7, lng: 139.77 },
          { lat: 35.72, lng: 139.8 },
        ]}
      />,
    )
    const leafletMocked = vi.mocked(L)
    expect(leafletMocked.polyline).toHaveBeenCalledWith(
      [
        [35.66, 139.7],
        [35.7, 139.77],
        [35.72, 139.8],
      ],
      expect.objectContaining({ dashArray: expect.any(String) }),
    )
  })

  it('does not draw a route line for a single stop or no route', () => {
    render(<MapView lat={35.68} lng={139.76} label="Tokyo, Japan" route={[{ lat: 35.66, lng: 139.7 }]} />)
    const leafletMocked = vi.mocked(L)
    expect(leafletMocked.polyline).not.toHaveBeenCalled()
  })
})
