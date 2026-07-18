import { useMemo, useState } from 'react'
import type { ThingToDo } from '../../../lib/api/client'
import { byPopularity } from '../../../lib/places/popularity'
import { ThingToDoCard } from './ThingToDoCard'

const TOP_LIMIT = 10

type Group = 'all' | 'food' | 'sights' | 'outdoors' | 'museums'

const FOOD = new Set(['restaurant', 'cafe', 'bar', 'bakery', 'food', 'meal_takeaway', 'meal_delivery'])
const MUSEUMS = new Set(['museum', 'art_gallery'])
const OUTDOORS = new Set(['park', 'natural_feature', 'campground', 'zoo', 'aquarium', 'beach', 'hiking_area', 'amusement_park'])

function groupOf(category: string): Exclude<Group, 'all'> {
  if (FOOD.has(category)) return 'food'
  if (MUSEUMS.has(category)) return 'museums'
  if (OUTDOORS.has(category)) return 'outdoors'
  return 'sights'
}

const FILTERS: { key: Group; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'food', label: 'Food' },
  { key: 'sights', label: 'Sights' },
  { key: 'outdoors', label: 'Outdoors' },
  { key: 'museums', label: 'Museums' },
]

/**
 * Nearby things-to-do with filters (by type), rating sort, an "on plan" badge
 * to prevent duplicates, and unrated/low-signal places hidden by default so the
 * list reads like curated picks rather than an unfiltered dump.
 */
export function ThingsToDoList({
  thingsToDo,
  plannedNames,
  onAdd,
  onSelect,
}: {
  thingsToDo: ThingToDo[]
  plannedNames?: Set<string>
  onAdd: (item: ThingToDo) => void
  onSelect: (item: ThingToDo) => void
}) {
  const [filter, setFilter] = useState<Group>('all')
  const [showUnrated, setShowUnrated] = useState(false)
  const [showAll, setShowAll] = useState(false)

  const hasUnrated = useMemo(() => thingsToDo.some((t) => t.rating == null), [thingsToDo])

  const ranked = useMemo(() => {
    return thingsToDo
      .filter((t) => filter === 'all' || groupOf(t.category) === filter)
      .filter((t) => showUnrated || t.rating != null)
      .sort(byPopularity)
  }, [thingsToDo, filter, showUnrated])

  const visible = showAll ? ranked : ranked.slice(0, TOP_LIMIT)

  if (thingsToDo.length === 0) return <p className="chronicle-rate-line">No nearby suggestions yet.</p>

  return (
    <div>
      <div className="chronicle-ttd-controls" role="group" aria-label="Filter places">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            className={`chronicle-ttd-filter${filter === f.key ? ' chronicle-ttd-filter--active' : ''}`}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </button>
        ))}
        {hasUnrated && (
          <button type="button" className="chronicle-ttd-showunrated" onClick={() => setShowUnrated((v) => !v)}>
            {showUnrated ? 'Hide unrated' : 'Show unrated'}
          </button>
        )}
        {ranked.length > TOP_LIMIT && (
          <button type="button" className="chronicle-ttd-showunrated" onClick={() => setShowAll((v) => !v)}>
            {showAll ? `Show top ${TOP_LIMIT}` : `Show all ${ranked.length}`}
          </button>
        )}
      </div>

      {visible.length === 0 ? (
        <p className="chronicle-rate-line">No {filter === 'all' ? 'rated' : filter} places here.</p>
      ) : (
        <ol className="chronicle-suggestions">
          {visible.map((item) => (
            <ThingToDoCard
              key={item.name}
              item={item}
              onPlan={plannedNames?.has(item.name) ?? false}
              onAdd={() => onAdd(item)}
              onSelect={() => onSelect(item)}
            />
          ))}
        </ol>
      )}
    </div>
  )
}
