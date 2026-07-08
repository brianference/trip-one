import { useTripContext } from '../useTripContext'
import { LocalInfoCard } from '../components/LocalInfoCard'

export function LocalInfoPage() {
  const { location, trip } = useTripContext()
  const displayName = location?.displayName ?? trip.locationSlug

  return (
    <article className="chronicle-chapter">
      <h1>Local info</h1>
      <LocalInfoCard displayName={displayName} />
    </article>
  )
}
