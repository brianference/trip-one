import { useEffect, useState } from 'react'
import { fetchPlaceDetails, type PlaceDetail } from '../../../lib/api/client'

/** What to look a place up by, plus a label to show immediately while loading. */
export interface PlaceQuery {
  label: string
  placeId?: string
  name?: string
  lat?: number
  lng?: number
  /** Category, carried so a place added from the detail sheet keeps its role/marker. */
  category?: string
}

/**
 * Fetches rich detail for the selected place. Passing `null` clears state (the
 * panel is closed). Re-fetches whenever the target place changes; a failed
 * lookup surfaces an error rather than throwing so the panel can show it.
 */
export function usePlaceDetail(query: PlaceQuery | null) {
  const [detail, setDetail] = useState<PlaceDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const key = query ? `${query.placeId ?? ''}|${query.name ?? ''}|${query.lat ?? ''}|${query.lng ?? ''}` : null

  useEffect(() => {
    if (!query) {
      setDetail(null)
      setError(null)
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    setDetail(null)
    fetchPlaceDetails({ placeId: query.placeId, name: query.name, lat: query.lat, lng: query.lng })
      .then((d) => {
        if (!cancelled) setDetail(d)
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Could not load details.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
    // Re-run only when the identifying fields change, not on every render.
  }, [key])

  return { detail, loading, error }
}
