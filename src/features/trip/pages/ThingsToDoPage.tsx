import { useTripContext } from '../useTripContext'
import { useItineraryActions } from '../hooks/useItineraryActions'
import { ThingsToDoList } from '../components/ThingsToDoList'

export function ThingsToDoPage() {
  const { trip, location } = useTripContext()
  const { addFromThingToDo } = useItineraryActions(trip.id)

  return (
    <article className="chronicle-chapter">
      <h1>Things to do nearby</h1>
      <ThingsToDoList thingsToDo={location?.thingsToDo ?? []} onAdd={addFromThingToDo} />
    </article>
  )
}
