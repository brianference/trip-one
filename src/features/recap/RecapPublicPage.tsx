import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Seo } from '../../components/Seo'
import { ButtonLink } from '../../components/ui/Button'
import { logger } from '../../lib/logger'
import type { RecapPayload } from './types'
import { RecapView, NEXT_TRIP_LINK_TEXT } from './RecapView'
import { TripSkeleton } from '../trip/components/TripSkeleton'

/** Shown for an unknown, revoked or malformed token (the server answers all of them with the same 404). */
export const RECAP_INACTIVE_MESSAGE = 'This recap link isn’t active anymore.'

/** Shown when the request fails with no usable server message (e.g. offline). */
const LOAD_ERROR_MESSAGE = 'We couldn’t load this recap. Please try again in a moment.'

/** HTTP status the recap API uses for unknown and revoked links alike. */
const HTTP_NOT_FOUND = 404

/** What the page is showing. */
type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; payload: RecapPayload }
  | { kind: 'failed'; message: string }

/**
 * Loads the public recap for a share token.
 * @param token - The recap token from the URL
 * @returns The page state to show
 */
async function loadRecap(token: string): Promise<LoadState> {
  const res = await fetch(`/api/recap/${encodeURIComponent(token)}`)
  if (res.status === HTTP_NOT_FOUND) return { kind: 'failed', message: RECAP_INACTIVE_MESSAGE }
  const body = (await res.json().catch(() => ({}))) as RecapPayload & { error?: unknown }
  if (!res.ok) return { kind: 'failed', message: typeof body.error === 'string' ? body.error : LOAD_ERROR_MESSAGE }
  return { kind: 'ready', payload: body }
}

/**
 * `/recap/:token`: the read-only recap a traveler shared. Needs no account;
 * the token is the capability, and nothing here can reach the trip itself
 * (the API never returns the trip id). Photos load through the token too.
 *
 * Rendered inside the site chrome: whoever opens a shared link has usually
 * never seen Trip One, and the header's brand, navigation and theme toggle
 * tell them where they are. The trip pages opt out of that chrome only
 * because they carry their own navigation, which a recap viewer has no use for.
 */
export function RecapPublicPage() {
  const { token = '' } = useParams<{ token: string }>()
  const [state, setState] = useState<LoadState>({ kind: 'loading' })

  useEffect(() => {
    let cancelled = false
    setState({ kind: 'loading' })
    loadRecap(token)
      .then((next) => {
        if (!cancelled) setState(next)
      })
      .catch((err) => {
        logger.error('recap load failed', err)
        if (!cancelled) setState({ kind: 'failed', message: LOAD_ERROR_MESSAGE })
      })
    return () => {
      cancelled = true
    }
  }, [token])

  const heading = state.kind === 'ready' ? (state.payload.title ?? `${state.payload.displayName} trip`) : 'Trip recap'

  return (
    <main id="main" className="chronicle-page chronicle-recap-public">
      {/* noindex: a share link is meant for the people it was sent to, not search results. */}
      <Seo title={`${heading} recap`} description="A trip recap shared from Trip One." noindex />
      <div className="chronicle-book">
        {state.kind === 'loading' && <TripSkeleton />}
        {state.kind === 'failed' && (
          <article className="chronicle-chapter">
            <h1>Trip recap</h1>
            <p role="alert" className="chronicle-rate-line">
              {state.message}
            </p>
            <footer className="chronicle-recap-footer">
              <ButtonLink to="/" size="lg">
                {NEXT_TRIP_LINK_TEXT}
              </ButtonLink>
            </footer>
          </article>
        )}
        {state.kind === 'ready' && (
          <RecapView
            payload={state.payload}
            photoUrl={(photoId) => `/api/recap/${encodeURIComponent(token)}/photos/${encodeURIComponent(photoId)}`}
            variant="public"
          />
        )}
      </div>
    </main>
  )
}
