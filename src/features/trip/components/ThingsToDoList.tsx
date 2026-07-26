import { useMemo, useState } from 'react'
import type { ThingToDo } from '../../../lib/api/client'
import { byPopularity } from '../../../lib/places/popularity'
import { ThingToDoCard } from './ThingToDoCard'
import { ExperienceCard } from './ExperienceCard'

const TOP_LIMIT = 10

type Group = 'all' | 'food' | 'sights' | 'outdoors' | 'museums' | 'experiences'

const FOOD = new Set(['restaurant', 'cafe', 'bar', 'bakery', 'food', 'meal_takeaway', 'meal_delivery'])
const MUSEUMS = new Set(['museum', 'art_gallery'])
const OUTDOORS = new Set(['park', 'natural_feature', 'campground', 'zoo', 'aquarium', 'beach', 'hiking_area', 'amusement_park'])

function isExperienceItem(item: ThingToDo): boolean {
  return item.source === 'viator'
}

function groupOf(item: ThingToDo): Exclude<Group, 'all'> {
  if (isExperienceItem(item)) return 'experiences'
  if (FOOD.has(item.category)) return 'food'
  if (MUSEUMS.has(item.category)) return 'museums'
  if (OUTDOORS.has(item.category)) return 'outdoors'
  return 'sights'
}

const FILTERS: { key: Group; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'food', label: 'Food' },
  { key: 'sights', label: 'Sights' },
  { key: 'outdoors', label: 'Outdoors' },
  { key: 'museums', label: 'Museums' },
  { key: 'experiences', label: 'Experiences' },
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

  const hasExperiences = useMemo(() => thingsToDo.some(isExperienceItem), [thingsToDo])

  const ranked = useMemo(() => {
    return thingsToDo
      .filter((t) => filter === 'all' || groupOf(t) === filter)
      .filter((t) => showUnrated || t.rating != null || isExperienceItem(t))
      .sort(byPopularity)
  }, [thingsToDo, filter, showUnrated])

  const visible = showAll ? ranked : ranked.slice(0, TOP_LIMIT)

  if (thingsToDo.length === 0) return <p className="chronicle-rate-line">No nearby suggestions yet.</p>

  const filters = hasExperiences ? FILTERS : FILTERS.filter((f) => f.key !== 'experiences')

  return (
    <div>
      <div className="chronicle-ttd-controls" role="group" aria-label="Filter places">
        {filters.map((f) => (
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
          {visible.map((item) =>
            isExperienceItem(item) ? (
              <li key={item.productCode ?? item.name} className="chronicle-ttd-card chronicle-ttd-card--experience">
                <ExperienceCard
                  item={{
                    name: item.name,
                    rating: item.rating,
                    numReviews: item.numReviews,
                    priceFrom: item.priceFrom,
                    currency: item.currency,
                    durationMinutes: item.durationMinutes,
                    bookingUrl: item.bookingUrl,
                    freeCancellation: item.freeCancellation,
                  }}
                />
                {!plannedNames?.has(item.name) && (
                  <button
                    type="button"
                    className="chronicle-ttd-add"
                    onClick={() => onAdd(item)}
                    aria-label={`Add ${item.name} to itinerary`}
                  >
                    Add
                  </button>
                )}
                {plannedNames?.has(item.name) && <span className="chronicle-ttd-onplan">✓ On your trip</span>}
              </li>
            ) : (
              <ThingToDoCard
                key={item.name}
                item={item}
                onPlan={plannedNames?.has(item.name) ?? false}
                onAdd={() => onAdd(item)}
                onSelect={() => onSelect(item)}
              />
            ),
          )}
        </ol>
      )}
    </div>
  )
}
