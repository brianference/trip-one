/**
 * Loading placeholder for a trip page: a shimmer for the map and a few stop
 * rows, so the first paint shows the shape of what's coming instead of a bare
 * "Loading…" line. Purely presentational; `aria-busy` announces the wait.
 */
export function TripSkeleton() {
  return (
    <div className="chronicle-skeleton" role="status" aria-busy="true" aria-label="Loading trip">
      <div className="chronicle-skeleton-block chronicle-skeleton-map" />
      <div className="chronicle-skeleton-line chronicle-skeleton-line--title" />
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="chronicle-skeleton-line" />
      ))}
      <span className="chronicle-visually-hidden">Loading…</span>
    </div>
  )
}
