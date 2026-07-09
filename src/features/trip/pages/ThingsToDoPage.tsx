import { useState } from 'react'
import { useTripContext } from '../useTripContext'
import { useItineraryActions } from '../hooks/useItineraryActions'
import { ThingsToDoList } from '../components/ThingsToDoList'
import { PlaceDetailPanel } from '../place/PlaceDetailPanel'
import { usePlaceDetail, type PlaceQuery } from '../place/usePlaceDetail'
import { placeQueryForThing } from '../place/placeQuery'

export function ThingsToDoPage() {
  const { trip, location } = useTripContext()
  const { addFromThingToDo } = useItineraryActions(trip.id)
  const [selected, setSelected] = useState<PlaceQuery | null>(null)
  const { detail, loading, error } = usePlaceDetail(selected)

  return (
    <article className="chronicle-chapter">
      <h1>Things to do nearby</h1>
      <ThingsToDoList
        thingsToDo={location?.thingsToDo ?? []}
        onAdd={addFromThingToDo}
        onSelect={(item) => setSelected(placeQueryForThing(item))}
      />
      {selected && (
        <PlaceDetailPanel query={selected} detail={detail} loading={loading} error={error} onClose={() => setSelected(null)} />
      )}
    </article>
  )
}
