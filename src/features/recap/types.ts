/**
 * What `GET /api/recap/:token` returns: a read-only view of one trip, shared
 * by the client (the public and owner recap pages) and the server.
 *
 * It deliberately carries no trip id: the trip URL grants edit access, so a
 * recap viewer must never be able to learn it.
 */
export interface RecapPayload {
  title: string | null
  displayName: string
  startDate: string | null
  tripLengthDays: number | null
  stops: { stopId: string; day: number; text: string; lat: number | null; lng: number | null; category: string | null }[]
  photos: { id: string; stopId: string; width: number; height: number; createdAt: string }[]
}
