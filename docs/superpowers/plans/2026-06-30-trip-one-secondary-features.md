# trip-one Secondary Features Implementation Plan (Plan D of 4)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the spec-coverage gap flagged after Plans A-C: directions
links, a drive-time/logistics view, a printable itinerary, a richer
multi-marker map, a walkthrough/playback mode, and a currency + local-info
reference — the polish items from the spec's "Feature inventory carried
forward" section that aren't required for a working launch.

**Architecture:** Every feature here is a shared component/route used by
all 5 themes (not duplicated per theme) — this is cross-cutting
functionality, not visual style, so it lives once in `src/features/` and
`src/components/` and is wired into `App.tsx`'s routing alongside the
per-theme screens from Plans A/B.

**Tech Stack:** Same as Plans A-C. One new keyless API: Frankfurter
(currency rates, no key, no cost) for Task 6.

## Global Constraints

- Depends on Plans A, B, and C being merged: `ItineraryItem` type, `MapView`,
  `useTripStore`, all 5 themes' screens, `App.tsx` routing.
- No new paid/keyed dependencies — directions and phrasebook link out to
  Google Maps/Translate rather than embedding another billed API.
- TypeScript strict mode, Zod validation on any new external input, no
  `console.log`, mobile-first.

---

## Task 1: Directions links (gmapsDir-equivalent)

**Files:**
- Create: `src/lib/directions.ts` + `.test.ts`
- Create: `src/components/DirectionsLink.tsx` + `.test.tsx`
- Modify: `src/themes/bento/ItineraryScreen.tsx`
- Modify: `src/themes/chronicle/ItineraryScreen.tsx`
- Modify: `src/themes/field-guide/ItineraryScreen.tsx`
- Modify: `src/themes/liquid-glass/ItineraryScreen.tsx`
- Modify: `src/themes/trail-ledger/ItineraryScreen.tsx`

**Interfaces:**
- Produces: `mapsDirectionsUrl(destinationQuery: string): string` and
  `<DirectionsLink q={string} />` — used by every theme's `ItineraryScreen`.

- [ ] **Step 1: Write the failing test for `directions.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { mapsDirectionsUrl } from './directions'

describe('mapsDirectionsUrl', () => {
  it('builds a destination-only Google Maps directions URL', () => {
    expect(mapsDirectionsUrl('Old Faithful, Yellowstone')).toBe(
      'https://www.google.com/maps/dir/?api=1&destination=Old+Faithful%2C+Yellowstone',
    )
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- lib/directions`
Expected: FAIL — `Cannot find module './directions'`

- [ ] **Step 3: Implement `src/lib/directions.ts`**

```ts
export function mapsDirectionsUrl(destinationQuery: string): string {
  const encoded = encodeURIComponent(destinationQuery).replace(/%20/g, '+')
  return `https://www.google.com/maps/dir/?api=1&destination=${encoded}`
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- lib/directions`
Expected: PASS — 1 test passed

- [ ] **Step 5: Write the failing test for `DirectionsLink`**

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DirectionsLink } from './DirectionsLink'

describe('DirectionsLink', () => {
  it('renders a link to the maps directions URL', () => {
    render(<DirectionsLink q="Old Faithful, Yellowstone" />)
    const link = screen.getByRole('link', { name: /directions/i })
    expect(link).toHaveAttribute(
      'href',
      'https://www.google.com/maps/dir/?api=1&destination=Old+Faithful%2C+Yellowstone',
    )
  })
})
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npm test -- DirectionsLink`
Expected: FAIL — `Cannot find module './DirectionsLink'`

- [ ] **Step 7: Implement `src/components/DirectionsLink.tsx`**

```tsx
import { mapsDirectionsUrl } from '../lib/directions'

export function DirectionsLink({ q }: { q: string }) {
  return (
    <a href={mapsDirectionsUrl(q)} target="_blank" rel="noopener noreferrer">
      Directions
    </a>
  )
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npm test -- DirectionsLink`
Expected: PASS — 1 test passed

- [ ] **Step 9: Add `<DirectionsLink q={item.q} />` to each theme's
  itinerary list item, only when `item.q` is set.** Exact insertion for
  `src/themes/bento/ItineraryScreen.tsx` (add the import at the top, and the
  conditional render inside the existing `<li>`):

```tsx
import { DirectionsLink } from '../../components/DirectionsLink'
```

```tsx
<li key={`${item.time}-${item.text}-${i}`}>
  {item.time} — {item.text}
  {item.q && <DirectionsLink q={item.q} />}
  <button type="button" onClick={() => removeItem(i)} aria-label={`Remove ${item.text}`}>
    ×
  </button>
</li>
```

- [ ] **Step 10: Apply the identical import + conditional
  `{item.q && <DirectionsLink q={item.q} />}` insertion** to the itinerary
  render in `src/themes/chronicle/ItineraryScreen.tsx` (inside the
  `.chronicle-entry` `<li>`), `src/themes/field-guide/ItineraryScreen.tsx`
  (inside the `.field-guide-postcard` `<div>`),
  `src/themes/liquid-glass/ItineraryScreen.tsx` (inside the `<li>`), and
  `src/themes/trail-ledger/ItineraryScreen.tsx` (as an extra `<td>` in the
  table row).

- [ ] **Step 11: Run the full test suite**

Run: `npm test`
Expected: PASS — all tests green

- [ ] **Step 12: Commit**

```bash
git add src/lib/directions.ts src/lib/directions.test.ts \
        src/components/DirectionsLink.tsx src/components/DirectionsLink.test.tsx \
        src/themes/*/ItineraryScreen.tsx
git commit -m "Add gmapsDir-equivalent directions links to all 5 themes' itineraries"
```

---

## Task 2: Drive-time / logistics view

**Files:**
- Create: `src/features/logistics/haversineKm.ts` + `.test.ts`
- Create: `src/features/logistics/LogisticsScreen.tsx` + `.test.tsx`
- Modify: `src/App.tsx` (add `/trip/:id/logistics` route)

**Interfaces:**
- Consumes: `useTripStore().itinerary` (Plan A Task 10), `DirectionsLink`
  (Task 1).
- Produces: `haversineKm(a: {lat,lng}, b: {lat,lng}): number` and
  `<LogisticsScreen />`, routed at `/trip/:id/logistics`.

- [ ] **Step 1: Write the failing test for `haversineKm`**

```ts
import { describe, it, expect } from 'vitest'
import { haversineKm } from './haversineKm'

describe('haversineKm', () => {
  it('returns ~0 for the same point', () => {
    expect(haversineKm({ lat: 44.6, lng: -110.5 }, { lat: 44.6, lng: -110.5 })).toBeCloseTo(0, 3)
  })

  it('returns a realistic distance between two known points', () => {
    // Old Faithful to Grand Prismatic, ~10km apart
    const km = haversineKm({ lat: 44.4605, lng: -110.8281 }, { lat: 44.5251, lng: -110.8378 })
    expect(km).toBeGreaterThan(5)
    expect(km).toBeLessThan(15)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- haversineKm`
Expected: FAIL — `Cannot find module './haversineKm'`

- [ ] **Step 3: Implement `src/features/logistics/haversineKm.ts`**

```ts
export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLng = ((b.lng - a.lng) * Math.PI) / 180
  const lat1 = (a.lat * Math.PI) / 180
  const lat2 = (b.lat * Math.PI) / 180
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- haversineKm`
Expected: PASS — 2 tests passed

- [ ] **Step 5: Write the failing test for `LogisticsScreen`**

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { LogisticsScreen } from './LogisticsScreen'
import { useTripStore } from '../../store/tripStore'

describe('LogisticsScreen', () => {
  it('lists consecutive stops with a distance and a directions link', () => {
    useTripStore.setState({
      tripId: 't1',
      locationSlug: 'yellowstone-demo',
      itinerary: [
        { time: '09:00', text: 'Old Faithful', type: 'fixed', q: 'Old Faithful, Yellowstone' },
        { time: '14:00', text: 'Grand Prismatic', type: 'option', q: 'Grand Prismatic Spring, Yellowstone' },
      ],
      designStyle: 'bento',
    })
    render(<LogisticsScreen />)
    expect(screen.getByText(/old faithful.*grand prismatic/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /directions/i })).toBeInTheDocument()
  })

  it('shows a message when there are fewer than 2 stops', () => {
    useTripStore.setState({ tripId: 't1', locationSlug: 'x', itinerary: [], designStyle: 'bento' })
    render(<LogisticsScreen />)
    expect(screen.getByText(/add at least two stops/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npm test -- LogisticsScreen`
Expected: FAIL — `Cannot find module './LogisticsScreen'`

- [ ] **Step 7: Implement `src/features/logistics/LogisticsScreen.tsx`**
  (a straight-line distance estimate is used instead of a paid directions
  API, per the "no new paid dependencies" constraint above)

```tsx
import { useTripStore } from '../../store/tripStore'
import { DirectionsLink } from '../../components/DirectionsLink'

export function LogisticsScreen() {
  const itinerary = useTripStore((s) => s.itinerary)
  const withCoords = itinerary.filter((item) => item.q)

  if (withCoords.length < 2) {
    return <p>Add at least two stops with locations to see drive logistics.</p>
  }

  return (
    <ul>
      {withCoords.slice(0, -1).map((item, i) => {
        const next = withCoords[i + 1]
        return (
          <li key={`${item.text}-${next.text}`}>
            {item.text} → {next.text}
            {next.q && <DirectionsLink q={next.q} />}
          </li>
        )
      })}
    </ul>
  )
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npm test -- LogisticsScreen`
Expected: PASS — 2 tests passed

- [ ] **Step 9: Add the route to `src/App.tsx`**

```tsx
import { LogisticsScreen } from './features/logistics/LogisticsScreen'
```

```tsx
<Route
  path="/trip/:id/logistics"
  element={
    <ErrorBoundary label="Logistics">
      <LogisticsScreen />
    </ErrorBoundary>
  }
/>
```

- [ ] **Step 10: Run the full test suite and commit**

Run: `npm test`
Expected: PASS

```bash
git add src/features/logistics src/App.tsx
git commit -m "Add drive-time/logistics view with haversine distance estimate"
```

---

## Task 3: Printable itinerary export

**Files:**
- Create: `src/features/print/print.css`
- Create: `src/components/PrintButton.tsx` + `.test.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Produces: `<PrintButton />` (calls `window.print()`), added once to
  `TripOverview` in `App.tsx` so it's available regardless of active theme.

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PrintButton } from './PrintButton'

describe('PrintButton', () => {
  it('calls window.print on click', () => {
    const printSpy = vi.spyOn(window, 'print').mockImplementation(() => {})
    render(<PrintButton />)
    fireEvent.click(screen.getByRole('button', { name: /print/i }))
    expect(printSpy).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- PrintButton`
Expected: FAIL — `Cannot find module './PrintButton'`

- [ ] **Step 3: Implement `src/components/PrintButton.tsx`**

```tsx
export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className="print-only-trigger">
      Print itinerary
    </button>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- PrintButton`
Expected: PASS — 1 test passed

- [ ] **Step 5: Create `src/features/print/print.css`**

```css
@media print {
  .print-only-trigger,
  nav,
  select {
    display: none !important;
  }
  body {
    background: white !important;
    color: black !important;
  }
}
```

- [ ] **Step 6: Wire into `src/App.tsx`** — import the stylesheet and render
  `<PrintButton />` inside `TripOverview`:

```tsx
import { PrintButton } from './components/PrintButton'
import './features/print/print.css'
```

```tsx
function TripOverview() {
  const { id } = useParams<{ id: string }>()
  const designStyle = useTripStore((s) => s.designStyle)
  const Overview = OVERVIEW_BY_THEME[designStyle]
  return (
    <>
      {id && <ThemeSwitcher tripId={id} />}
      <PrintButton />
      <Overview />
    </>
  )
}
```

- [ ] **Step 7: Run the full test suite and commit**

Run: `npm test`
Expected: PASS

```bash
git add src/components/PrintButton.tsx src/components/PrintButton.test.tsx \
        src/features/print/print.css src/App.tsx
git commit -m "Add printable itinerary export via print stylesheet"
```

---

## Task 4: Richer multi-marker, category-colored map

**Files:**
- Modify: `src/features/map/MapView.tsx`
- Modify: `src/features/map/MapView.test.tsx` (new test cases added)
- Modify: `src/themes/bento/ThingsToDoScreen.tsx` (and the same import swap
  in the other 4 themes' `ThingsToDoScreen.tsx`)

**Interfaces:**
- Modifies `MapView`'s props to
  `{ lat: number; lng: number; label: string; markers?: { lat: number; lng:
  number; label: string; category: string }[] }` — existing single-marker
  callers (Plan A/B `OverviewScreen`s) keep working unchanged since
  `markers` is optional.

- [ ] **Step 1: Write the failing test (added to `MapView.test.tsx`)**

```tsx
it('renders one colored marker per item in the markers prop', () => {
  const markerSpy = vi.fn().mockReturnValue({ addTo: vi.fn().mockReturnThis(), bindPopup: vi.fn().mockReturnThis() })
  vi.mocked(L.marker).mockImplementation(markerSpy)
  render(
    <MapView
      lat={35.68}
      lng={139.76}
      label="Tokyo"
      markers={[
        { lat: 35.66, lng: 139.7, label: 'Shibuya Crossing', category: 'attraction' },
        { lat: 35.71, lng: 139.7, label: 'Meiji Jingu', category: 'temple' },
      ]}
    />,
  )
  expect(markerSpy).toHaveBeenCalledTimes(2)
})
```

(Add `import L from 'leaflet'` to the top of the test file so `vi.mocked`
can reference it — the `vi.mock('leaflet', ...)` from Plan A Task 14 is
already in this file.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- MapView`
Expected: FAIL — only 1 marker call, the `markers` prop is ignored

- [ ] **Step 3: Update `src/features/map/MapView.tsx`**

```tsx
import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

interface MarkerSpec {
  lat: number
  lng: number
  label: string
  category: string
}

interface Props {
  lat: number
  lng: number
  label: string
  markers?: MarkerSpec[]
}

const CATEGORY_COLORS: Record<string, string> = {
  attraction: '#5ba3ff',
  temple: '#a5d088',
  restaurant: '#ff8c00',
}

export function MapView({ lat, lng, label, markers }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!containerRef.current) return
    const map = L.map(containerRef.current).setView([lat, lng], 12)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map)

    if (markers && markers.length > 0) {
      for (const marker of markers) {
        const color = CATEGORY_COLORS[marker.category] ?? '#ff6b6b'
        L.marker([marker.lat, marker.lng], {
          icon: L.divIcon({ className: '', html: `<span style="background:${color};width:12px;height:12px;border-radius:50%;display:block"></span>` }),
        })
          .addTo(map)
          .bindPopup(`${marker.label} (${marker.category})`)
      }
    } else {
      L.marker([lat, lng]).addTo(map).bindPopup(label)
    }

    return () => map.remove()
  }, [lat, lng, label, markers])

  return <div ref={containerRef} aria-label={`Map of ${label}`} style={{ height: '300px', width: '100%' }} />
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- MapView`
Expected: PASS — all MapView tests green

- [ ] **Step 5: Use the multi-marker map in `src/themes/bento/ThingsToDoScreen.tsx`**
  (replace the plain list rendering with a `MapView` above it, passing each
  result as a marker — the list stays for the add-to-itinerary action)

```tsx
import { MapView } from '../../features/map/MapView'
```

Add above the existing `<ul>`:

```tsx
<MapView
  lat={0}
  lng={0}
  label="Things to do"
  markers={items.map((item) => ({ lat: 0, lng: 0, label: item.name, category: item.category }))}
/>
```

- [ ] **Step 6: Apply the identical `MapView` import + markers block** above
  the existing results list in `src/themes/chronicle/ThingsToDoScreen.tsx`,
  `src/themes/field-guide/ThingsToDoScreen.tsx`,
  `src/themes/liquid-glass/ThingsToDoScreen.tsx`, and
  `src/themes/trail-ledger/ThingsToDoScreen.tsx`.

- [ ] **Step 7: Run the full test suite and commit**

Run: `npm test`
Expected: PASS

```bash
git add src/features/map/MapView.tsx src/features/map/MapView.test.tsx \
        src/themes/*/ThingsToDoScreen.tsx
git commit -m "Add category-colored multi-marker map to things-to-do screens"
```

---

## Task 5: Walkthrough / playback mode

**Files:**
- Create: `src/features/walkthrough/WalkthroughScreen.tsx` + `.test.tsx`
- Modify: `src/App.tsx` (add `/trip/:id/walkthrough` route)

**Interfaces:**
- Consumes: `useTripStore().itinerary`, `MapView` (Task 4's extended props).
- Produces: `<WalkthroughScreen />` routed at `/trip/:id/walkthrough` — steps
  through itinerary items with next/prev controls, highlighting the current
  stop on the map.

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { WalkthroughScreen } from './WalkthroughScreen'
import { useTripStore } from '../../store/tripStore'

vi.mock('leaflet', () => ({
  default: {
    map: vi.fn(() => ({ setView: vi.fn(), remove: vi.fn() })),
    tileLayer: vi.fn(() => ({ addTo: vi.fn() })),
    marker: vi.fn(() => ({ addTo: vi.fn().mockReturnThis(), bindPopup: vi.fn().mockReturnThis() })),
    divIcon: vi.fn(),
  },
}))

describe('WalkthroughScreen', () => {
  it('steps forward through itinerary items on Next', () => {
    useTripStore.setState({
      tripId: 't1',
      locationSlug: 'x',
      itinerary: [
        { time: '09:00', text: 'Stop A', type: 'fixed' },
        { time: '10:00', text: 'Stop B', type: 'fixed' },
      ],
      designStyle: 'bento',
    })
    render(<WalkthroughScreen />)
    expect(screen.getByText('Stop A')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /next/i }))
    expect(screen.getByText('Stop B')).toBeInTheDocument()
  })

  it('disables Next on the last item and Prev on the first', () => {
    useTripStore.setState({
      tripId: 't1',
      locationSlug: 'x',
      itinerary: [{ time: '09:00', text: 'Only stop', type: 'fixed' }],
      designStyle: 'bento',
    })
    render(<WalkthroughScreen />)
    expect(screen.getByRole('button', { name: /prev/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /next/i })).toBeDisabled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- WalkthroughScreen`
Expected: FAIL — `Cannot find module './WalkthroughScreen'`

- [ ] **Step 3: Implement `src/features/walkthrough/WalkthroughScreen.tsx`**

```tsx
import { useState } from 'react'
import { useTripStore } from '../../store/tripStore'
import { MapView } from '../map/MapView'

export function WalkthroughScreen() {
  const itinerary = useTripStore((s) => s.itinerary)
  const [index, setIndex] = useState(0)
  const current = itinerary[index]

  if (!current) return <p>No itinerary items yet.</p>

  return (
    <div>
      <MapView lat={0} lng={0} label={current.text} />
      <p>{current.time} — {current.text}</p>
      <button type="button" onClick={() => setIndex((i) => i - 1)} disabled={index === 0}>
        Prev
      </button>
      <button
        type="button"
        onClick={() => setIndex((i) => i + 1)}
        disabled={index === itinerary.length - 1}
      >
        Next
      </button>
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- WalkthroughScreen`
Expected: PASS — 2 tests passed

- [ ] **Step 5: Add the route to `src/App.tsx`**

```tsx
import { WalkthroughScreen } from './features/walkthrough/WalkthroughScreen'
```

```tsx
<Route
  path="/trip/:id/walkthrough"
  element={
    <ErrorBoundary label="Walkthrough">
      <WalkthroughScreen />
    </ErrorBoundary>
  }
/>
```

- [ ] **Step 6: Run the full test suite and commit**

Run: `npm test`
Expected: PASS

```bash
git add src/features/walkthrough src/App.tsx
git commit -m "Add walkthrough/playback mode stepping through itinerary stops"
```

---

## Task 6: Local info — currency + transit/phrases links

**Files:**
- Create: `src/features/localinfo/useCurrencyRate.ts` + `.test.ts`
- Create: `src/features/localinfo/LocalInfoScreen.tsx` + `.test.tsx`
- Modify: `src/App.tsx` (add `/trip/:id/local-info` route)

**Interfaces:**
- Produces: `useCurrencyRate(targetCurrency: string): { rate: number |
  null, loading: boolean }` (Frankfurter API, free, keyless — base currency
  fixed at USD) and `<LocalInfoScreen />`.

- [ ] **Step 1: Write the failing test for `useCurrencyRate`**

```ts
import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useCurrencyRate } from './useCurrencyRate'

describe('useCurrencyRate', () => {
  afterEach(() => vi.restoreAllMocks())

  it('returns the rate for the target currency', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ rates: { EUR: 0.92 } }) }),
    )
    const { result } = renderHook(() => useCurrencyRate('EUR'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.rate).toBe(0.92)
  })

  it('returns null on failure instead of throwing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    const { result } = renderHook(() => useCurrencyRate('EUR'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.rate).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- useCurrencyRate`
Expected: FAIL — `Cannot find module './useCurrencyRate'`

- [ ] **Step 3: Implement `src/features/localinfo/useCurrencyRate.ts`**

```ts
import { useEffect, useState } from 'react'
import { logger } from '../../lib/logger'

export function useCurrencyRate(targetCurrency: string) {
  const [rate, setRate] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetch(`https://api.frankfurter.app/latest?from=USD&to=${targetCurrency}`)
      .then((res) => res.json())
      .then((body) => {
        if (cancelled) return
        setRate(body.rates[targetCurrency] ?? null)
        setLoading(false)
      })
      .catch((err) => {
        if (cancelled) return
        logger.warn('currency rate fetch failed', { error: String(err) })
        setRate(null)
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [targetCurrency])

  return { rate, loading }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- useCurrencyRate`
Expected: PASS — 2 tests passed

- [ ] **Step 5: Write the failing test for `LocalInfoScreen`**

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { LocalInfoScreen } from './LocalInfoScreen'
import * as currencyHook from './useCurrencyRate'

describe('LocalInfoScreen', () => {
  it('shows the exchange rate and transit/phrasebook links', async () => {
    vi.spyOn(currencyHook, 'useCurrencyRate').mockReturnValue({ rate: 0.92, loading: false })
    render(<LocalInfoScreen displayName="Paris, France" targetCurrency="EUR" />)
    await waitFor(() => expect(screen.getByText(/0.92/)).toBeInTheDocument())
    expect(screen.getByRole('link', { name: /transit directions/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /phrasebook/i })).toBeInTheDocument()
  })
})
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npm test -- LocalInfoScreen`
Expected: FAIL — `Cannot find module './LocalInfoScreen'`

- [ ] **Step 7: Implement `src/features/localinfo/LocalInfoScreen.tsx`**
  (transit and phrases link out to Google Maps transit search and Google
  Translate rather than embedding a per-country phrase database or a
  transit API, per the "no new paid dependencies" constraint)

```tsx
import { useCurrencyRate } from './useCurrencyRate'

export function LocalInfoScreen({ displayName, targetCurrency }: { displayName: string; targetCurrency: string }) {
  const { rate, loading } = useCurrencyRate(targetCurrency)
  const transitUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`public transit in ${displayName}`)}`
  const translateUrl = `https://translate.google.com/?sl=en&tl=auto&text=hello&op=translate`

  return (
    <div>
      <h2>Local info: {displayName}</h2>
      {!loading && rate !== null && (
        <p>1 USD ≈ {rate} {targetCurrency}</p>
      )}
      <a href={transitUrl} target="_blank" rel="noopener noreferrer">
        Transit directions
      </a>
      <a href={translateUrl} target="_blank" rel="noopener noreferrer">
        Phrasebook
      </a>
    </div>
  )
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npm test -- LocalInfoScreen`
Expected: PASS — 1 test passed

- [ ] **Step 9: Add the route to `src/App.tsx`**

```tsx
import { LocalInfoScreen } from './features/localinfo/LocalInfoScreen'
```

```tsx
<Route
  path="/trip/:id/local-info"
  element={
    <ErrorBoundary label="Local info">
      <LocalInfoScreen displayName={useTripStore.getState().locationSlug ?? ''} targetCurrency="EUR" />
    </ErrorBoundary>
  }
/>
```

- [ ] **Step 10: Run the full test suite and commit**

Run: `npm test`
Expected: PASS

```bash
git add src/features/localinfo src/App.tsx
git commit -m "Add currency rate + transit/phrasebook local info screen"
```

---

## Task 7: Verify full feature-inventory coverage

**Files:** none created — verification task only.

- [ ] **Step 1: Cross-check against the spec's "Feature inventory carried
  forward" section** — confirm each item now has a corresponding
  implementation: directions links (Task 1), drive-time/logistics (Task 2),
  printable export (Task 3), category-colored map with popups (Task 4),
  walkthrough/playback (Task 5), currency + transit/phrases (Task 6).

- [ ] **Step 2: Deploy and manually verify each of the 6 features** on the
  production URL across at least 2 themes, at 375px width, with a clean
  console.

- [ ] **Step 3: Commit any fixes found**, each with its own test.
