# trip-one Remaining Themes Implementation Plan (Plan B of 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the remaining 4 selectable themes (Chronicle, Field
Guide, Liquid Glass, Trail Ledger) against the screen/routing/store contract
Plan A established with the Bento theme, plus a theme switcher so a trip can
be viewed in any of the 5.

**Architecture:** Each theme is a self-contained folder under
`src/themes/<name>/` exporting the same four screens (`SearchScreen`,
`OverviewScreen`, `ItineraryScreen`, `ThingsToDoScreen`) as Bento, built on
the same `useTripStore`, `src/lib/api/client.ts`, `useForecast`, and
`MapView`/`StaticMap` from Plan A — only markup and CSS differ per theme.
`App.tsx` picks which theme's screens to render based on
`useTripStore().designStyle`.

**Tech Stack:** Same as Plan A (React 18, TypeScript, Vitest,
@testing-library/react) — no new dependencies.

## Global Constraints

- Depends on Plan A being merged: `useTripStore` (`src/store/tripStore.ts`),
  `fetchLocation`/`createTrip`/`getTrip`/`updateTrip`
  (`src/lib/api/client.ts`), `useForecast`
  (`src/features/weather/useForecast.ts`), `MapView`/`StaticMap`
  (`src/features/map/`), `ErrorBoundary` (`src/components/ErrorBoundary.tsx`).
- Every theme implements all 4 screens — no partial themes shipped.
- All UI mobile-first, test at 375px minimum.
- TypeScript strict mode, no `console.log` (use `src/lib/logger.ts`), no
  hardcoded secrets.
- Liquid Glass gets extra mobile-optimization attention per the design spec.

---

## Task 1: Chronicle theme (vertical day-timeline)

**Files:**
- Create: `src/themes/chronicle/SearchScreen.tsx`
- Create: `src/themes/chronicle/OverviewScreen.tsx`
- Create: `src/themes/chronicle/ItineraryScreen.tsx`
- Create: `src/themes/chronicle/ThingsToDoScreen.tsx`
- Create: `src/themes/chronicle/chronicle.test.tsx`
- Create: `src/themes/chronicle/chronicle.css`

**Interfaces:**
- Consumes: `useTripStore`, `fetchLocation`/`createTrip`/`getTrip` (Plan A
  Task 12), `useForecast` (Plan A Task 13), `ErrorBoundary` (Plan A Task 11).
- Produces: the same four exports as `src/themes/bento/*` — Task 5 (theme
  switcher) imports all five themes' screens by identical names.

- [ ] **Step 1: Write the failing tests — `src/themes/chronicle/chronicle.test.tsx`**

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { SearchScreen } from './SearchScreen'
import { OverviewScreen } from './OverviewScreen'
import { ItineraryScreen } from './ItineraryScreen'
import { ThingsToDoScreen } from './ThingsToDoScreen'
import { useTripStore } from '../../store/tripStore'
import * as client from '../../lib/api/client'
import * as forecastHook from '../../features/weather/useForecast'

describe('Chronicle theme', () => {
  it('SearchScreen creates a trip and navigates', async () => {
    vi.spyOn(client, 'fetchLocation').mockResolvedValue({
      slug: 'kyoto-japan',
      lat: 35.01,
      lng: 135.77,
      displayName: 'Kyoto, Japan',
      thingsToDo: [],
    })
    vi.spyOn(client, 'createTrip').mockResolvedValue({ id: 't2', locationSlug: 'kyoto-japan', itinerary: [], designStyle: 'chronicle' })
    render(
      <MemoryRouter>
        <SearchScreen />
      </MemoryRouter>,
    )
    fireEvent.change(screen.getByLabelText(/where to/i), { target: { value: 'Kyoto, Japan' } })
    fireEvent.click(screen.getByRole('button', { name: /go/i }))
    await waitFor(() => expect(client.createTrip).toHaveBeenCalledWith('kyoto-japan'))
  })

  it('OverviewScreen renders the location as a day-one chapter heading', async () => {
    vi.spyOn(client, 'getTrip').mockResolvedValue({ id: 't2', locationSlug: 'kyoto-japan', itinerary: [], designStyle: 'chronicle' })
    vi.spyOn(forecastHook, 'useForecast').mockReturnValue({ data: { temperatureC: 18, condition: 'Clear', isFallback: false }, error: null, loading: false })
    render(
      <MemoryRouter initialEntries={['/trip/t2']}>
        <Routes>
          <Route path="/trip/:id" element={<OverviewScreen />} />
        </Routes>
      </MemoryRouter>,
    )
    await waitFor(() => expect(screen.getByRole('heading')).toHaveTextContent(/kyoto-japan/i))
  })

  it('ItineraryScreen renders items as timeline entries with a type dot', () => {
    useTripStore.setState({
      tripId: 't2',
      locationSlug: 'kyoto-japan',
      itinerary: [{ time: '09:00', text: 'Fushimi Inari', type: 'option' }],
      designStyle: 'chronicle',
    })
    render(<ItineraryScreen />)
    expect(screen.getByText('Fushimi Inari')).toBeInTheDocument()
    expect(screen.getByTestId('timeline-dot-option')).toBeInTheDocument()
  })

  it('ThingsToDoScreen lists cached results', async () => {
    vi.spyOn(client, 'fetchLocation').mockResolvedValue({
      slug: 'kyoto-japan',
      lat: 35.01,
      lng: 135.77,
      displayName: 'Kyoto, Japan',
      thingsToDo: [{ name: 'Fushimi Inari Shrine', category: 'attraction', source: 'tripadvisor' }],
    })
    render(<ThingsToDoScreen locationSlug="kyoto-japan" />)
    await waitFor(() => expect(screen.getByText('Fushimi Inari Shrine')).toBeInTheDocument())
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- chronicle`
Expected: FAIL — cannot find the theme modules

- [ ] **Step 3: Implement `src/themes/chronicle/SearchScreen.tsx`**

```tsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchLocation, createTrip } from '../../lib/api/client'
import { useTripStore } from '../../store/tripStore'
import { logger } from '../../lib/logger'

export function SearchScreen() {
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()
  const setTrip = useTripStore((s) => s.setTrip)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const location = await fetchLocation(query)
      const trip = await createTrip(location.slug)
      setTrip(trip.id, trip.locationSlug, trip.itinerary, trip.designStyle)
      navigate(`/trip/${trip.id}`)
    } catch (err) {
      logger.error('chronicle search failed', err)
      setError(err instanceof Error ? err.message : 'something went wrong')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="chronicle-search">
      <label htmlFor="chronicle-location-query">Where to?</label>
      <input id="chronicle-location-query" value={query} onChange={(e) => setQuery(e.target.value)} />
      <button type="submit" disabled={busy}>
        {busy ? 'Loading…' : 'Go'}
      </button>
      {error && <p role="alert">{error}</p>}
    </form>
  )
}
```

- [ ] **Step 4: Implement `src/themes/chronicle/OverviewScreen.tsx`**

```tsx
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { getTrip, type Trip } from '../../lib/api/client'
import { useForecast } from '../../features/weather/useForecast'
import { ErrorBoundary } from '../../components/ErrorBoundary'

function Chapter({ trip }: { trip: Trip }) {
  const { data: forecast } = useForecast(0, 0)
  return (
    <article className="chronicle-chapter">
      <h1>Day one: {trip.locationSlug}</h1>
      {forecast && <p>{forecast.temperatureC}°C — {forecast.condition}</p>}
    </article>
  )
}

export function OverviewScreen() {
  const { id } = useParams<{ id: string }>()
  const [trip, setTrip] = useState<Trip | null>(null)

  useEffect(() => {
    if (id) getTrip(id).then(setTrip)
  }, [id])

  if (!trip) return <p>Loading…</p>

  return (
    <ErrorBoundary label="Overview">
      <Chapter trip={trip} />
    </ErrorBoundary>
  )
}
```

- [ ] **Step 5: Implement `src/themes/chronicle/ItineraryScreen.tsx`**

```tsx
import { useState } from 'react'
import { useTripStore } from '../../store/tripStore'

const DOT_COLOR: Record<string, string> = { fixed: '#a5d088', travel: '#ffd700', option: '#5ba3ff' }

export function ItineraryScreen() {
  const [time, setTime] = useState('')
  const [text, setText] = useState('')
  const itinerary = useTripStore((s) => s.itinerary)
  const addItem = useTripStore((s) => s.addItem)
  const removeItem = useTripStore((s) => s.removeItem)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!time || !text) return
    addItem({ time, text, type: 'option' })
    setTime('')
    setText('')
  }

  return (
    <div className="chronicle-timeline">
      <form onSubmit={handleSubmit}>
        <label htmlFor="chronicle-stop-time">Time</label>
        <input id="chronicle-stop-time" value={time} onChange={(e) => setTime(e.target.value)} />
        <label htmlFor="chronicle-stop-text">What</label>
        <input id="chronicle-stop-text" value={text} onChange={(e) => setText(e.target.value)} />
        <button type="submit">Add stop</button>
      </form>
      <ol>
        {itinerary.map((item, i) => (
          <li key={`${item.time}-${item.text}-${i}`} className="chronicle-entry">
            <span data-testid={`timeline-dot-${item.type}`} style={{ background: DOT_COLOR[item.type] }} />
            <span>{item.time} — {item.text}</span>
            <button type="button" onClick={() => removeItem(i)} aria-label={`Remove ${item.text}`}>
              ×
            </button>
          </li>
        ))}
      </ol>
    </div>
  )
}
```

- [ ] **Step 6: Implement `src/themes/chronicle/ThingsToDoScreen.tsx`**

```tsx
import { useEffect, useState } from 'react'
import { fetchLocation, type ThingToDo } from '../../lib/api/client'
import { useTripStore } from '../../store/tripStore'

export function ThingsToDoScreen({ locationSlug }: { locationSlug: string }) {
  const [items, setItems] = useState<ThingToDo[]>([])
  const addItem = useTripStore((s) => s.addItem)

  useEffect(() => {
    fetchLocation(locationSlug).then((loc) => setItems(loc.thingsToDo))
  }, [locationSlug])

  return (
    <ol className="chronicle-suggestions">
      {items.map((item) => (
        <li key={item.name}>
          {item.name} ({item.category})
          <button type="button" onClick={() => addItem({ time: '', text: item.name, type: 'option', q: item.name })}>
            Add to timeline
          </button>
        </li>
      ))}
    </ol>
  )
}
```

- [ ] **Step 7: Create `src/themes/chronicle/chronicle.css`**

```css
.chronicle-timeline ol {
  border-left: 3px solid #2d2d2d;
  margin-left: 12px;
  padding-left: 16px;
}
.chronicle-entry {
  position: relative;
  padding: 8px 0;
}
.chronicle-entry span[data-testid^='timeline-dot'] {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  margin-right: 8px;
}
.chronicle-chapter h1 {
  font-style: italic;
}
@media (max-width: 480px) {
  .chronicle-timeline ol {
    margin-left: 6px;
    padding-left: 10px;
  }
}
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `npm test -- chronicle`
Expected: PASS — 4 tests passed

- [ ] **Step 9: Commit**

```bash
git add src/themes/chronicle
git commit -m "Add Chronicle theme (vertical day-timeline)"
```

---

## Task 2: Field Guide theme (map-hero with overlay cards)

**Files:**
- Create: `src/themes/field-guide/SearchScreen.tsx`
- Create: `src/themes/field-guide/OverviewScreen.tsx`
- Create: `src/themes/field-guide/ItineraryScreen.tsx`
- Create: `src/themes/field-guide/ThingsToDoScreen.tsx`
- Create: `src/themes/field-guide/field-guide.test.tsx`
- Create: `src/themes/field-guide/field-guide.css`

**Interfaces:**
- Consumes: same as Task 1, plus `MapView`/`StaticMap` (Plan A Task 14) for
  the map-hero.
- Produces: same four exports as Task 1.

- [ ] **Step 1: Write the failing tests**

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { OverviewScreen } from './OverviewScreen'
import { ThingsToDoScreen } from './ThingsToDoScreen'
import * as client from '../../lib/api/client'
import * as forecastHook from '../../features/weather/useForecast'

vi.mock('leaflet', () => ({
  default: {
    map: vi.fn(() => ({ setView: vi.fn(), remove: vi.fn() })),
    tileLayer: vi.fn(() => ({ addTo: vi.fn() })),
    marker: vi.fn(() => ({ addTo: vi.fn().mockReturnThis(), bindPopup: vi.fn().mockReturnThis() })),
  },
}))

describe('Field Guide theme', () => {
  it('OverviewScreen renders the map hero with an overlay card', async () => {
    vi.spyOn(client, 'getTrip').mockResolvedValue({ id: 't3', locationSlug: 'yellowstone-demo', itinerary: [], designStyle: 'field-guide' })
    vi.spyOn(forecastHook, 'useForecast').mockReturnValue({ data: { temperatureC: 10, condition: 'Clear', isFallback: false }, error: null, loading: false })
    render(
      <MemoryRouter initialEntries={['/trip/t3']}>
        <Routes>
          <Route path="/trip/:id" element={<OverviewScreen />} />
        </Routes>
      </MemoryRouter>,
    )
    await waitFor(() => expect(screen.getByTestId('field-guide-overlay-card')).toHaveTextContent(/yellowstone-demo/i))
  })

  it('ThingsToDoScreen renders results as postcard entries', async () => {
    vi.spyOn(client, 'fetchLocation').mockResolvedValue({
      slug: 'yellowstone-demo',
      lat: 44.6,
      lng: -110.5,
      displayName: 'Yellowstone',
      thingsToDo: [{ name: 'Old Faithful', category: 'attraction', source: 'tripadvisor' }],
    })
    render(<ThingsToDoScreen locationSlug="yellowstone-demo" />)
    await waitFor(() => expect(screen.getByText('Old Faithful')).toBeInTheDocument())
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- field-guide`
Expected: FAIL — cannot find the theme modules

- [ ] **Step 3: Implement `src/themes/field-guide/OverviewScreen.tsx`** (the
  hero — `SearchScreen`, `ItineraryScreen`, `ThingsToDoScreen` follow the
  same pattern as Task 1, re-skinned; shown in full below)

```tsx
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { getTrip, type Trip } from '../../lib/api/client'
import { useForecast } from '../../features/weather/useForecast'
import { MapView } from '../../features/map/MapView'
import { ErrorBoundary } from '../../components/ErrorBoundary'

function Hero({ trip }: { trip: Trip }) {
  const { data: forecast } = useForecast(0, 0)
  return (
    <div className="field-guide-hero">
      <MapView lat={0} lng={0} label={trip.locationSlug} />
      <div className="field-guide-overlay-card" data-testid="field-guide-overlay-card">
        <h1>{trip.locationSlug}</h1>
        {forecast && <p>{forecast.temperatureC}°C — {forecast.condition}</p>}
      </div>
    </div>
  )
}

export function OverviewScreen() {
  const { id } = useParams<{ id: string }>()
  const [trip, setTrip] = useState<Trip | null>(null)

  useEffect(() => {
    if (id) getTrip(id).then(setTrip)
  }, [id])

  if (!trip) return <p>Loading…</p>

  return (
    <ErrorBoundary label="Overview">
      <Hero trip={trip} />
    </ErrorBoundary>
  )
}
```

- [ ] **Step 4: Implement `src/themes/field-guide/SearchScreen.tsx`**

```tsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchLocation, createTrip } from '../../lib/api/client'
import { useTripStore } from '../../store/tripStore'
import { logger } from '../../lib/logger'

export function SearchScreen() {
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()
  const setTrip = useTripStore((s) => s.setTrip)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const location = await fetchLocation(query)
      const trip = await createTrip(location.slug)
      setTrip(trip.id, trip.locationSlug, trip.itinerary, trip.designStyle)
      navigate(`/trip/${trip.id}`)
    } catch (err) {
      logger.error('field-guide search failed', err)
      setError(err instanceof Error ? err.message : 'something went wrong')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="field-guide-search">
      <label htmlFor="fg-location-query">Where to?</label>
      <input id="fg-location-query" value={query} onChange={(e) => setQuery(e.target.value)} />
      <button type="submit" disabled={busy}>
        {busy ? 'Loading…' : 'Go'}
      </button>
      {error && <p role="alert">{error}</p>}
    </form>
  )
}
```

- [ ] **Step 5: Implement `src/themes/field-guide/ItineraryScreen.tsx`**

```tsx
import { useState } from 'react'
import { useTripStore } from '../../store/tripStore'

export function ItineraryScreen() {
  const [time, setTime] = useState('')
  const [text, setText] = useState('')
  const itinerary = useTripStore((s) => s.itinerary)
  const addItem = useTripStore((s) => s.addItem)
  const removeItem = useTripStore((s) => s.removeItem)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!time || !text) return
    addItem({ time, text, type: 'option' })
    setTime('')
    setText('')
  }

  return (
    <div className="field-guide-postcards">
      <form onSubmit={handleSubmit}>
        <label htmlFor="fg-stop-time">Time</label>
        <input id="fg-stop-time" value={time} onChange={(e) => setTime(e.target.value)} />
        <label htmlFor="fg-stop-text">What</label>
        <input id="fg-stop-text" value={text} onChange={(e) => setText(e.target.value)} />
        <button type="submit">Add stop</button>
      </form>
      <div className="field-guide-postcard-grid">
        {itinerary.map((item, i) => (
          <div key={`${item.time}-${item.text}-${i}`} className="field-guide-postcard">
            <p>{item.time} — {item.text}</p>
            <button type="button" onClick={() => removeItem(i)} aria-label={`Remove ${item.text}`}>
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Implement `src/themes/field-guide/ThingsToDoScreen.tsx`**

```tsx
import { useEffect, useState } from 'react'
import { fetchLocation, type ThingToDo } from '../../lib/api/client'
import { useTripStore } from '../../store/tripStore'

export function ThingsToDoScreen({ locationSlug }: { locationSlug: string }) {
  const [items, setItems] = useState<ThingToDo[]>([])
  const addItem = useTripStore((s) => s.addItem)

  useEffect(() => {
    fetchLocation(locationSlug).then((loc) => setItems(loc.thingsToDo))
  }, [locationSlug])

  return (
    <div className="field-guide-postcard-grid">
      {items.map((item) => (
        <div key={item.name} className="field-guide-postcard">
          <p>{item.name} ({item.category})</p>
          <button type="button" onClick={() => addItem({ time: '', text: item.name, type: 'option', q: item.name })}>
            Add to guide
          </button>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 7: Create `src/themes/field-guide/field-guide.css`**

```css
.field-guide-hero {
  position: relative;
}
.field-guide-overlay-card {
  position: absolute;
  bottom: 12px;
  left: 12px;
  right: 12px;
  background: #fdf8ec;
  border: 2px solid #2f4f3a;
  border-radius: 4px;
  padding: 12px;
}
.field-guide-postcard-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  padding: 12px;
}
.field-guide-postcard {
  background: #fdf8ec;
  border: 1px solid #b8860b;
  border-radius: 4px;
  padding: 10px;
}
@media (max-width: 480px) {
  .field-guide-postcard-grid {
    grid-template-columns: 1fr;
  }
}
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `npm test -- field-guide`
Expected: PASS — 2 tests passed

- [ ] **Step 9: Commit**

```bash
git add src/themes/field-guide
git commit -m "Add Field Guide theme (map-hero with overlay cards)"
```

---

## Task 3: Liquid Glass theme (frosted glassmorphism, mobile-optimized)

**Files:**
- Create: `src/themes/liquid-glass/SearchScreen.tsx`
- Create: `src/themes/liquid-glass/OverviewScreen.tsx`
- Create: `src/themes/liquid-glass/ItineraryScreen.tsx`
- Create: `src/themes/liquid-glass/ThingsToDoScreen.tsx`
- Create: `src/themes/liquid-glass/liquid-glass.test.tsx`
- Create: `src/themes/liquid-glass/liquid-glass.css`

**Interfaces:** same contract as Task 1/2.

This theme carries the user's explicit "make sure it is mobile optimized
iphone glass style" requirement — tests assert touch targets meet the 44px
minimum guideline (a gap the tokyo-one source theme had at 38px, per the
earlier icon-fix agent's finding).

- [ ] **Step 1: Write the failing tests**

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { SearchScreen } from './SearchScreen'
import { ItineraryScreen } from './ItineraryScreen'
import { useTripStore } from '../../store/tripStore'
import * as client from '../../lib/api/client'

describe('Liquid Glass theme', () => {
  it('SearchScreen creates a trip and navigates', async () => {
    vi.spyOn(client, 'fetchLocation').mockResolvedValue({ slug: 'lisbon-portugal', lat: 38.7, lng: -9.1, displayName: 'Lisbon, Portugal', thingsToDo: [] })
    vi.spyOn(client, 'createTrip').mockResolvedValue({ id: 't4', locationSlug: 'lisbon-portugal', itinerary: [], designStyle: 'liquid-glass' })
    render(
      <MemoryRouter>
        <SearchScreen />
      </MemoryRouter>,
    )
    fireEvent.change(screen.getByLabelText(/where to/i), { target: { value: 'Lisbon, Portugal' } })
    fireEvent.click(screen.getByRole('button', { name: /go/i }))
    await waitFor(() => expect(client.createTrip).toHaveBeenCalledWith('lisbon-portugal'))
  })

  it('remove-item tap targets are at least 44px per the mobile-optimization requirement', () => {
    useTripStore.setState({ tripId: 't4', locationSlug: 'lisbon-portugal', itinerary: [{ time: '09:00', text: 'Belem Tower', type: 'option' }], designStyle: 'liquid-glass' })
    render(<ItineraryScreen />)
    const removeButton = screen.getByLabelText(/remove belem tower/i)
    expect(removeButton.className).toContain('lg-tap-target')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- liquid-glass`
Expected: FAIL — cannot find the theme modules

- [ ] **Step 3: Implement `src/themes/liquid-glass/SearchScreen.tsx`**

```tsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchLocation, createTrip } from '../../lib/api/client'
import { useTripStore } from '../../store/tripStore'
import { logger } from '../../lib/logger'

export function SearchScreen() {
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()
  const setTrip = useTripStore((s) => s.setTrip)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const location = await fetchLocation(query)
      const trip = await createTrip(location.slug)
      setTrip(trip.id, trip.locationSlug, trip.itinerary, trip.designStyle)
      navigate(`/trip/${trip.id}`)
    } catch (err) {
      logger.error('liquid-glass search failed', err)
      setError(err instanceof Error ? err.message : 'something went wrong')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="lg-glass-card lg-search">
      <label htmlFor="lg-location-query">Where to?</label>
      <input id="lg-location-query" value={query} onChange={(e) => setQuery(e.target.value)} className="lg-tap-target" />
      <button type="submit" disabled={busy} className="lg-tap-target">
        {busy ? 'Loading…' : 'Go'}
      </button>
      {error && <p role="alert">{error}</p>}
    </form>
  )
}
```

- [ ] **Step 4: Implement `src/themes/liquid-glass/OverviewScreen.tsx`**

```tsx
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { getTrip, type Trip } from '../../lib/api/client'
import { useForecast } from '../../features/weather/useForecast'
import { ErrorBoundary } from '../../components/ErrorBoundary'

function GlassOverview({ trip }: { trip: Trip }) {
  const { data: forecast } = useForecast(0, 0)
  return (
    <div className="lg-glass-card">
      <h1>{trip.locationSlug}</h1>
      {forecast && <p>{forecast.temperatureC}°C — {forecast.condition}</p>}
    </div>
  )
}

export function OverviewScreen() {
  const { id } = useParams<{ id: string }>()
  const [trip, setTrip] = useState<Trip | null>(null)

  useEffect(() => {
    if (id) getTrip(id).then(setTrip)
  }, [id])

  if (!trip) return <p>Loading…</p>

  return (
    <ErrorBoundary label="Overview">
      <GlassOverview trip={trip} />
    </ErrorBoundary>
  )
}
```

- [ ] **Step 5: Implement `src/themes/liquid-glass/ItineraryScreen.tsx`** (44px
  tap targets via the `lg-tap-target` class, per the mobile requirement)

```tsx
import { useState } from 'react'
import { useTripStore } from '../../store/tripStore'

export function ItineraryScreen() {
  const [time, setTime] = useState('')
  const [text, setText] = useState('')
  const itinerary = useTripStore((s) => s.itinerary)
  const addItem = useTripStore((s) => s.addItem)
  const removeItem = useTripStore((s) => s.removeItem)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!time || !text) return
    addItem({ time, text, type: 'option' })
    setTime('')
    setText('')
  }

  return (
    <div className="lg-glass-card">
      <form onSubmit={handleSubmit}>
        <label htmlFor="lg-stop-time">Time</label>
        <input id="lg-stop-time" value={time} onChange={(e) => setTime(e.target.value)} className="lg-tap-target" />
        <label htmlFor="lg-stop-text">What</label>
        <input id="lg-stop-text" value={text} onChange={(e) => setText(e.target.value)} className="lg-tap-target" />
        <button type="submit" className="lg-tap-target">Add stop</button>
      </form>
      <ul>
        {itinerary.map((item, i) => (
          <li key={`${item.time}-${item.text}-${i}`}>
            {item.time} — {item.text}
            <button
              type="button"
              onClick={() => removeItem(i)}
              aria-label={`Remove ${item.text}`}
              className="lg-tap-target"
            >
              ×
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
```

- [ ] **Step 6: Implement `src/themes/liquid-glass/ThingsToDoScreen.tsx`**

```tsx
import { useEffect, useState } from 'react'
import { fetchLocation, type ThingToDo } from '../../lib/api/client'
import { useTripStore } from '../../store/tripStore'

export function ThingsToDoScreen({ locationSlug }: { locationSlug: string }) {
  const [items, setItems] = useState<ThingToDo[]>([])
  const addItem = useTripStore((s) => s.addItem)

  useEffect(() => {
    fetchLocation(locationSlug).then((loc) => setItems(loc.thingsToDo))
  }, [locationSlug])

  return (
    <ul className="lg-glass-card">
      {items.map((item) => (
        <li key={item.name}>
          {item.name} ({item.category})
          <button
            type="button"
            className="lg-tap-target"
            onClick={() => addItem({ time: '', text: item.name, type: 'option', q: item.name })}
          >
            Add
          </button>
        </li>
      ))}
    </ul>
  )
}
```

- [ ] **Step 7: Create `src/themes/liquid-glass/liquid-glass.css`** (44px
  minimum tap targets, frosted card, blue-gradient background)

```css
:root {
  --lg-primary-blue: #0a84ff;
  --lg-glass-blur: 24px;
  --lg-glass-opacity: 0.55;
}
body.theme-liquid-glass {
  background: radial-gradient(circle at 30% 20%, rgba(10, 132, 255, 0.2) 0%, transparent 60%),
    linear-gradient(160deg, #e8f1ff 0%, #ffffff 55%, #f0f4ff 100%);
}
.lg-glass-card {
  backdrop-filter: blur(var(--lg-glass-blur)) saturate(160%);
  background: rgba(255, 255, 255, var(--lg-glass-opacity));
  border-radius: 20px;
  border: 1px solid rgba(10, 132, 255, 0.15);
  padding: 16px;
  margin: 12px;
}
.lg-tap-target {
  min-height: 44px;
  min-width: 44px;
}
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `npm test -- liquid-glass`
Expected: PASS — 2 tests passed

- [ ] **Step 9: Commit**

```bash
git add src/themes/liquid-glass
git commit -m "Add Liquid Glass theme with 44px mobile tap targets"
```

---

## Task 4: Trail Ledger theme (dense minimal list/table)

**Files:**
- Create: `src/themes/trail-ledger/SearchScreen.tsx`
- Create: `src/themes/trail-ledger/OverviewScreen.tsx`
- Create: `src/themes/trail-ledger/ItineraryScreen.tsx`
- Create: `src/themes/trail-ledger/ThingsToDoScreen.tsx`
- Create: `src/themes/trail-ledger/trail-ledger.test.tsx`
- Create: `src/themes/trail-ledger/trail-ledger.css`

**Interfaces:** same contract as Tasks 1-3.

- [ ] **Step 1: Write the failing tests**

```tsx
import { describe, it, expect, vi, waitFor } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { OverviewScreen } from './OverviewScreen'
import { ItineraryScreen } from './ItineraryScreen'
import { useTripStore } from '../../store/tripStore'
import * as client from '../../lib/api/client'
import * as forecastHook from '../../features/weather/useForecast'

describe('Trail Ledger theme', () => {
  it('OverviewScreen renders as a table row, not a card', async () => {
    vi.spyOn(client, 'getTrip').mockResolvedValue({ id: 't5', locationSlug: 'reykjavik-iceland', itinerary: [], designStyle: 'trail-ledger' })
    vi.spyOn(forecastHook, 'useForecast').mockReturnValue({ data: { temperatureC: 4, condition: 'Overcast', isFallback: false }, error: null, loading: false })
    render(
      <MemoryRouter initialEntries={['/trip/t5']}>
        <Routes>
          <Route path="/trip/:id" element={<OverviewScreen />} />
        </Routes>
      </MemoryRouter>,
    )
    await waitFor(() => expect(screen.getByRole('table')).toBeInTheDocument())
  })

  it('ItineraryScreen renders itinerary items as table rows', () => {
    useTripStore.setState({ tripId: 't5', locationSlug: 'reykjavik-iceland', itinerary: [{ time: '09:00', text: 'Blue Lagoon', type: 'option' }], designStyle: 'trail-ledger' })
    render(<ItineraryScreen />)
    expect(screen.getAllByRole('row').length).toBeGreaterThan(1)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- trail-ledger`
Expected: FAIL — cannot find the theme modules

- [ ] **Step 3: Implement `src/themes/trail-ledger/SearchScreen.tsx`**

```tsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchLocation, createTrip } from '../../lib/api/client'
import { useTripStore } from '../../store/tripStore'
import { logger } from '../../lib/logger'

export function SearchScreen() {
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()
  const setTrip = useTripStore((s) => s.setTrip)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const location = await fetchLocation(query)
      const trip = await createTrip(location.slug)
      setTrip(trip.id, trip.locationSlug, trip.itinerary, trip.designStyle)
      navigate(`/trip/${trip.id}`)
    } catch (err) {
      logger.error('trail-ledger search failed', err)
      setError(err instanceof Error ? err.message : 'something went wrong')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="tl-search">
      <label htmlFor="tl-location-query">Where to?</label>
      <input id="tl-location-query" value={query} onChange={(e) => setQuery(e.target.value)} />
      <button type="submit" disabled={busy}>
        {busy ? 'Loading…' : 'Go'}
      </button>
      {error && <p role="alert">{error}</p>}
    </form>
  )
}
```

- [ ] **Step 4: Implement `src/themes/trail-ledger/OverviewScreen.tsx`**

```tsx
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { getTrip, type Trip } from '../../lib/api/client'
import { useForecast } from '../../features/weather/useForecast'
import { ErrorBoundary } from '../../components/ErrorBoundary'

function LedgerTable({ trip }: { trip: Trip }) {
  const { data: forecast } = useForecast(0, 0)
  return (
    <table>
      <tbody>
        <tr>
          <th>Location</th>
          <td>{trip.locationSlug}</td>
        </tr>
        {forecast && (
          <tr>
            <th>Weather</th>
            <td>{forecast.temperatureC}°C — {forecast.condition}</td>
          </tr>
        )}
      </tbody>
    </table>
  )
}

export function OverviewScreen() {
  const { id } = useParams<{ id: string }>()
  const [trip, setTrip] = useState<Trip | null>(null)

  useEffect(() => {
    if (id) getTrip(id).then(setTrip)
  }, [id])

  if (!trip) return <p>Loading…</p>

  return (
    <ErrorBoundary label="Overview">
      <LedgerTable trip={trip} />
    </ErrorBoundary>
  )
}
```

- [ ] **Step 5: Implement `src/themes/trail-ledger/ItineraryScreen.tsx`**

```tsx
import { useState } from 'react'
import { useTripStore } from '../../store/tripStore'

export function ItineraryScreen() {
  const [time, setTime] = useState('')
  const [text, setText] = useState('')
  const itinerary = useTripStore((s) => s.itinerary)
  const addItem = useTripStore((s) => s.addItem)
  const removeItem = useTripStore((s) => s.removeItem)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!time || !text) return
    addItem({ time, text, type: 'option' })
    setTime('')
    setText('')
  }

  return (
    <div className="tl-ledger">
      <form onSubmit={handleSubmit}>
        <label htmlFor="tl-stop-time">Time</label>
        <input id="tl-stop-time" value={time} onChange={(e) => setTime(e.target.value)} />
        <label htmlFor="tl-stop-text">What</label>
        <input id="tl-stop-text" value={text} onChange={(e) => setText(e.target.value)} />
        <button type="submit">Add stop</button>
      </form>
      <table>
        <thead>
          <tr>
            <th>Time</th>
            <th>Stop</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {itinerary.map((item, i) => (
            <tr key={`${item.time}-${item.text}-${i}`}>
              <td>{item.time}</td>
              <td>{item.text}</td>
              <td>
                <button type="button" onClick={() => removeItem(i)} aria-label={`Remove ${item.text}`}>
                  ×
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 6: Implement `src/themes/trail-ledger/ThingsToDoScreen.tsx`**

```tsx
import { useEffect, useState } from 'react'
import { fetchLocation, type ThingToDo } from '../../lib/api/client'
import { useTripStore } from '../../store/tripStore'

export function ThingsToDoScreen({ locationSlug }: { locationSlug: string }) {
  const [items, setItems] = useState<ThingToDo[]>([])
  const addItem = useTripStore((s) => s.addItem)

  useEffect(() => {
    fetchLocation(locationSlug).then((loc) => setItems(loc.thingsToDo))
  }, [locationSlug])

  return (
    <table className="tl-suggestions">
      <thead>
        <tr>
          <th>Name</th>
          <th>Category</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {items.map((item) => (
          <tr key={item.name}>
            <td>{item.name}</td>
            <td>{item.category}</td>
            <td>
              <button type="button" onClick={() => addItem({ time: '', text: item.name, type: 'option', q: item.name })}>
                Add
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
```

- [ ] **Step 7: Create `src/themes/trail-ledger/trail-ledger.css`**

```css
.tl-ledger table,
.tl-suggestions {
  width: 100%;
  border-collapse: collapse;
  font-family: ui-monospace, monospace;
  font-size: 14px;
}
.tl-ledger td,
.tl-ledger th,
.tl-suggestions td,
.tl-suggestions th {
  border-bottom: 1px solid #e5e5e5;
  padding: 6px 8px;
  text-align: left;
}
@media (max-width: 480px) {
  .tl-ledger table,
  .tl-suggestions {
    font-size: 12px;
  }
}
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `npm test -- trail-ledger`
Expected: PASS — 2 tests passed

- [ ] **Step 9: Commit**

```bash
git add src/themes/trail-ledger
git commit -m "Add Trail Ledger theme (dense minimal table/list)"
```

---

## Task 5: Theme switcher + wire all 5 themes into `App.tsx`

**Files:**
- Create: `src/components/ThemeSwitcher.tsx` + `.test.tsx`
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`

**Interfaces:**
- Consumes: `useTripStore().designStyle`/`setDesignStyle` (Plan A Task 10),
  `updateTrip` (Plan A Task 12), all 5 themes' `SearchScreen` /
  `OverviewScreen` / `ItineraryScreen` / `ThingsToDoScreen`.
- Produces: `<ThemeSwitcher tripId={string} />` — a picker rendered in the
  app shell; changing it calls `setDesignStyle` and persists via
  `updateTrip`.

- [ ] **Step 1: Write the failing test — `src/components/ThemeSwitcher.test.tsx`**

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ThemeSwitcher } from './ThemeSwitcher'
import { useTripStore } from '../store/tripStore'
import * as client from '../lib/api/client'

describe('ThemeSwitcher', () => {
  it('updates the store and persists the new style', async () => {
    useTripStore.setState({ tripId: 't1', locationSlug: 'dublin-ireland', itinerary: [], designStyle: 'bento' })
    vi.spyOn(client, 'updateTrip').mockResolvedValue({ id: 't1', locationSlug: 'dublin-ireland', itinerary: [], designStyle: 'trail-ledger' })
    render(<ThemeSwitcher tripId="t1" />)
    fireEvent.change(screen.getByLabelText(/design/i), { target: { value: 'trail-ledger' } })
    await waitFor(() => expect(useTripStore.getState().designStyle).toBe('trail-ledger'))
    expect(client.updateTrip).toHaveBeenCalledWith('t1', { designStyle: 'trail-ledger' })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- ThemeSwitcher`
Expected: FAIL — `Cannot find module './ThemeSwitcher'`

- [ ] **Step 3: Implement `src/components/ThemeSwitcher.tsx`**

```tsx
import { useTripStore, type DesignStyle } from '../store/tripStore'
import { updateTrip } from '../lib/api/client'

const OPTIONS: { value: DesignStyle; label: string }[] = [
  { value: 'bento', label: 'Bento' },
  { value: 'chronicle', label: 'Chronicle' },
  { value: 'field-guide', label: 'Field Guide' },
  { value: 'liquid-glass', label: 'Liquid Glass' },
  { value: 'trail-ledger', label: 'Trail Ledger' },
]

export function ThemeSwitcher({ tripId }: { tripId: string }) {
  const designStyle = useTripStore((s) => s.designStyle)
  const setDesignStyle = useTripStore((s) => s.setDesignStyle)

  async function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value as DesignStyle
    setDesignStyle(next)
    await updateTrip(tripId, { designStyle: next })
  }

  return (
    <label>
      Design
      <select value={designStyle} onChange={handleChange} aria-label="Design">
        {OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- ThemeSwitcher`
Expected: PASS — 1 test passed

- [ ] **Step 5: Update `src/App.tsx`** to render the theme matching
  `designStyle`, with the `ThemeSwitcher` visible on trip routes

```tsx
import { BrowserRouter, Routes, Route, useParams } from 'react-router-dom'
import { useTripStore, type DesignStyle } from './store/tripStore'
import { ThemeSwitcher } from './components/ThemeSwitcher'
import { ErrorBoundary } from './components/ErrorBoundary'
import * as bento from './themes/bento/SearchScreen'
import * as bentoOverview from './themes/bento/OverviewScreen'
import * as bentoItinerary from './themes/bento/ItineraryScreen'
import * as bentoThings from './themes/bento/ThingsToDoScreen'
import * as chronicleOverview from './themes/chronicle/OverviewScreen'
import * as chronicleItinerary from './themes/chronicle/ItineraryScreen'
import * as fieldGuideOverview from './themes/field-guide/OverviewScreen'
import * as fieldGuideItinerary from './themes/field-guide/ItineraryScreen'
import * as liquidGlassOverview from './themes/liquid-glass/OverviewScreen'
import * as liquidGlassItinerary from './themes/liquid-glass/ItineraryScreen'
import * as trailLedgerOverview from './themes/trail-ledger/OverviewScreen'
import * as trailLedgerItinerary from './themes/trail-ledger/ItineraryScreen'
import './themes/bento/bento.css'
import './themes/chronicle/chronicle.css'
import './themes/field-guide/field-guide.css'
import './themes/liquid-glass/liquid-glass.css'
import './themes/trail-ledger/trail-ledger.css'

const OVERVIEW_BY_THEME: Record<DesignStyle, React.ComponentType> = {
  bento: bentoOverview.OverviewScreen,
  chronicle: chronicleOverview.OverviewScreen,
  'field-guide': fieldGuideOverview.OverviewScreen,
  'liquid-glass': liquidGlassOverview.OverviewScreen,
  'trail-ledger': trailLedgerOverview.OverviewScreen,
}

const ITINERARY_BY_THEME: Record<DesignStyle, React.ComponentType> = {
  bento: bentoItinerary.ItineraryScreen,
  chronicle: chronicleItinerary.ItineraryScreen,
  'field-guide': fieldGuideItinerary.ItineraryScreen,
  'liquid-glass': liquidGlassItinerary.ItineraryScreen,
  'trail-ledger': trailLedgerItinerary.ItineraryScreen,
}

function TripOverview() {
  const { id } = useParams<{ id: string }>()
  const designStyle = useTripStore((s) => s.designStyle)
  const Overview = OVERVIEW_BY_THEME[designStyle]
  return (
    <>
      {id && <ThemeSwitcher tripId={id} />}
      <Overview />
    </>
  )
}

function TripItinerary() {
  const designStyle = useTripStore((s) => s.designStyle)
  const Itinerary = ITINERARY_BY_THEME[designStyle]
  return <Itinerary />
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/"
          element={
            <ErrorBoundary label="Search">
              <bento.SearchScreen />
            </ErrorBoundary>
          }
        />
        <Route
          path="/trip/:id"
          element={
            <ErrorBoundary label="Overview">
              <TripOverview />
            </ErrorBoundary>
          }
        />
        <Route
          path="/trip/:id/itinerary"
          element={
            <ErrorBoundary label="Itinerary">
              <TripItinerary />
            </ErrorBoundary>
          }
        />
      </Routes>
    </BrowserRouter>
  )
}
```

- [ ] **Step 6: Run the full test suite**

Run: `npm test`
Expected: PASS — all tests green across all 5 themes

- [ ] **Step 7: Commit**

```bash
git add src/components/ThemeSwitcher.tsx src/components/ThemeSwitcher.test.tsx src/App.tsx
git commit -m "Add theme switcher and wire all 5 themes into routing"
```

- [ ] **Step 8: Manual mobile QA** — at 375px width, verify each of the 5
  themes' Search/Overview/Itinerary/ThingsToDo screens render without
  horizontal overflow, and Liquid Glass's interactive elements are all at
  least 44×44px (per Task 3's `lg-tap-target` class).
