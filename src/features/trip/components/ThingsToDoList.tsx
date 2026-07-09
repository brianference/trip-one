import type { ThingToDo } from '../../../lib/api/client'
import { ThingToDoCard } from './ThingToDoCard'

/** The full list of nearby things-to-do suggestions. */
export function ThingsToDoList({
  thingsToDo,
  onAdd,
  onSelect,
}: {
  thingsToDo: ThingToDo[]
  onAdd: (item: ThingToDo) => void
  onSelect: (item: ThingToDo) => void
}) {
  if (thingsToDo.length === 0) return <p className="chronicle-rate-line">No nearby suggestions yet.</p>
  return (
    <ol className="chronicle-suggestions">
      {thingsToDo.map((item) => (
        <ThingToDoCard key={item.name} item={item} onAdd={() => onAdd(item)} onSelect={() => onSelect(item)} />
      ))}
    </ol>
  )
}
