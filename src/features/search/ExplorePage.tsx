import { useCallback, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Seo } from '../../components/Seo'
import { PageShell } from '../../components/layout/PageShell'
import { SearchBox, type Suggestion } from './SearchBox'
import { DestinationImage } from '../../components/DestinationImage'
import { ButtonLink } from '../../components/ui/Button'

/**
 * Explore: search plus a browsable set of starting points.
 *
 * The curated list matters more than it looks. A search box on an empty page
 * asks the visitor to already know where they want to go; the large travel
 * sites all pair search with browsable inspiration for exactly that reason.
 * These are real destinations the planner handles well.
 */
const FEATURED: { slug: string; name: string; country: string; blurb: string; tags: string[] }[] = [
  { slug: 'dublin-ireland', name: 'Dublin', country: 'Ireland', blurb: 'Pubs, whiskey and walkable history.', tags: ['City break', 'Nightlife'] },
  { slug: 'jackson-wyoming', name: 'Jackson', country: 'Wyoming', blurb: 'Tetons, skiing and wildlife on the doorstep.', tags: ['Outdoors', 'Family'] },
  { slug: 'kyoto-japan', name: 'Kyoto', country: 'Japan', blurb: 'Temples, gardens and quiet backstreets.', tags: ['Culture', 'Walkable'] },
  { slug: 'lisbon-portugal', name: 'Lisbon', country: 'Portugal', blurb: 'Viewpoints, tiles and long lunches.', tags: ['City break', 'Food'] },
  { slug: 'new-orleans-louisiana', name: 'New Orleans', country: 'Louisiana', blurb: 'Music on every corner, and the food.', tags: ['Food', 'Music'] },
  { slug: 'queenstown-new-zealand', name: 'Queenstown', country: 'New Zealand', blurb: 'Adventure sports against big scenery.', tags: ['Outdoors', 'Adventure'] },
  { slug: 'marrakech-morocco', name: 'Marrakech', country: 'Morocco', blurb: 'Souks, palaces and courtyard gardens.', tags: ['Culture', 'Markets'] },
  { slug: 'banff-canada', name: 'Banff', country: 'Canada', blurb: 'Lakes and peaks, easy with kids.', tags: ['Outdoors', 'Family'] },
]

const FILTERS = ['All', 'City break', 'Outdoors', 'Family', 'Food', 'Culture'] as const

export function ExplorePage() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const activeFilter = params.get('filter') ?? 'All'
  const query = params.get('q') ?? ''

  /**
   * Suggestions come from the app's existing autocomplete endpoint. It fails
   * soft to an empty list, because free text must always remain submittable.
   */
  const fetchSuggestions = useCallback(async (q: string, signal: AbortSignal): Promise<Suggestion[]> => {
    const res = await fetch(`/api/autocomplete?q=${encodeURIComponent(q)}`, { signal })
    if (!res.ok) return []
    // The endpoint returns `displayName` — a full Nominatim string like
    // "Dublin, Leinster, Ireland". Reading a `label` field that doesn't exist
    // silently produced empty suggestions and no dropdown ever appeared.
    const body = (await res.json()) as { suggestions?: { displayName?: string }[] }
    return (body.suggestions ?? [])
      .map((s) => String(s.displayName ?? '').trim())
      .filter((name) => name !== '')
      .map((name) => {
        // Show the place as the label and the rest as quiet context, so the
        // list is scannable instead of eight near-identical long strings.
        const parts = name.split(',').map((p) => p.trim())
        return {
          label: parts[0],
          context: parts.length > 1 ? parts[parts.length - 1] : undefined,
          full: name,
        }
      })
      .slice(0, 8)
  }, [])

  const visible = useMemo(
    () =>
      FEATURED.filter((d) => {
        const matchesFilter = activeFilter === 'All' || d.tags.includes(activeFilter)
        const q = query.trim().toLowerCase()
        const matchesQuery =
          q === '' || d.name.toLowerCase().includes(q) || d.country.toLowerCase().includes(q) || d.blurb.toLowerCase().includes(q)
        return matchesFilter && matchesQuery
      }),
    [activeFilter, query],
  )

  return (
    <>
      <Seo
        title="Explore destinations"
        description="Search any destination or start from a handful we plan especially well — city breaks, outdoors, family trips and food."
        path="/explore"
      />
      <PageShell
        title="Where to?"
        lead="Search any destination in the world, or start from one of these."
        crumbs={[{ label: 'Home', to: '/' }, { label: 'Explore' }]}
        wide
      >
        <div className="mb-8 max-w-2xl">
          <SearchBox
            fetchSuggestions={fetchSuggestions}
            initialValue={query}
            onSubmit={(q) => {
              // Searching sends you to the planner, which is where a
              // destination actually turns into a trip.
              navigate(`/?destination=${encodeURIComponent(q)}`)
            }}
            onQueryChange={(q) => {
              // Keep the query in the URL so the grid filters live and the view
              // stays shareable — but REPLACE rather than push, or every
              // keystroke becomes a history entry and Back has to be pressed
              // once per character typed.
              setParams(
                (current) => {
                  const next = new URLSearchParams(current)
                  if (q.trim() === '') next.delete('q')
                  else next.set('q', q)
                  return next
                },
                { replace: true },
              )
            }}
          />
        </div>

        <div className="mb-6 flex flex-wrap gap-2" role="group" aria-label="Filter destinations">
          {FILTERS.map((f) => {
            const active = f === activeFilter
            return (
              <button
                key={f}
                type="button"
                aria-pressed={active}
                onClick={() => {
                  setParams(
                    (current) => {
                      const next = new URLSearchParams(current)
                      if (f === 'All') next.delete('filter')
                      else next.set('filter', f)
                      return next
                    },
                    { replace: true },
                  )
                }}
                className={`min-h-[40px] rounded-[var(--radius-pill)] border px-4 text-sm font-medium transition-colors ${
                  active
                    ? 'border-dusk-500 bg-dusk-500 text-[var(--color-on-accent)]'
                    : 'border-[var(--hairline)] hover:bg-[var(--surface-muted)]'
                }`}
              >
                {f}
              </button>
            )
          })}
        </div>

        {visible.length === 0 ? (
          <div className="rounded-[var(--radius-card)] border border-dashed border-[var(--hairline)] p-10 text-center">
            <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold">
              Nothing here matches "{query}"
            </h2>
            <p className="mx-auto mt-2 max-w-sm opacity-75">
              That doesn't mean we can't plan it — search sends any destination straight to the planner.
            </p>
            <ButtonLink to={`/?destination=${encodeURIComponent(query)}`} size="lg" className="mt-6">
              Plan a trip to {query || 'anywhere'}
            </ButtonLink>
          </div>
        ) : (
          <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {visible.map((d, i) => (
              <li
                key={d.slug}
                className="group overflow-hidden rounded-[var(--radius-card)] border border-[var(--hairline)] bg-[var(--surface)] shadow-[var(--shadow-card)] transition-shadow hover:shadow-[var(--shadow-lifted)]"
              >
                <a href={`/?destination=${encodeURIComponent(`${d.name}, ${d.country}`)}`} className="block">
                  <DestinationImage
                    slug={d.slug}
                    alt={`${d.name}, ${d.country}`}
                    className="h-40 w-full"
                    // Only the first row is above the fold on a phone.
                    priority={i < 2}
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 300px"
                  />
                  <div className="p-4">
                    <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold leading-snug group-hover:text-dusk-600">
                      {d.name}
                    </h2>
                    <p className="text-sm opacity-60">{d.country}</p>
                    <p className="mt-2 text-sm opacity-80">{d.blurb}</p>
                  </div>
                </a>
              </li>
            ))}
          </ul>
        )}
      </PageShell>
    </>
  )
}
