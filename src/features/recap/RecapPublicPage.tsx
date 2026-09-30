import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { Seo } from '../../components/Seo'
import { ButtonLink } from '../../components/ui/Button'
import { logger } from '../../lib/logger'
import { useAuth } from '../auth/AuthContext'
import type { RecapPayload } from './types'
import { RecapView, NEXT_TRIP_LINK_TEXT } from './RecapView'
import { TripSkeleton } from '../trip/components/TripSkeleton'
import { AddPhotosBanner, INVITE_PARAM, JOIN_PARAM } from './AddPhotosBanner'
import { ContributorBanner, type ContributorEntry } from './ContributorBanner'
import { fetchRecapMembership, type RecapMembership } from './recapPhotosApi'
import { useRecapContributions } from './useRecapContributions'

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
 * Loads the public recap for a share token. The session cookie goes along,
 * so a member's own photos come back marked `mine`.
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
 * "the Anaheim, California trip" or "the “Autumn in Oslo” trip": the trip as
 * the join sheet's sentences name it.
 * @param payload - The loaded recap
 */
function tripPhrase(payload: RecapPayload): string {
  return payload.title ? `the “${payload.title}” trip` : `the ${payload.displayName} trip`
}

/**
 * `/recap/:token`: the read-only recap a traveler shared. Needs no account;
 * the token is the capability, and nothing here can reach the trip itself
 * (the API never returns the trip id). Photos load through the token too.
 *
 * Under the header sits either "Were you on this trip?" (anyone who is not a
 * member: it leads to the join sheet) or, for a signed-in member of the trip
 * (`GET /api/recap/:token/me`, or a join just now), contributor mode: an "Add
 * photos" banner and a remove control on the viewer's own photos. Neither
 * shows until membership is known, so a member never sees the join banner
 * flash first.
 *
 * Rendered inside the site chrome: whoever opens a shared link has usually
 * never seen Trip One, and the header's brand, navigation and theme toggle
 * tell them where they are. The trip pages opt out of that chrome only
 * because they carry their own navigation, which a recap viewer has no use for.
 */
export function RecapPublicPage() {
  const { token = '' } = useParams<{ token: string }>()
  const { user, loading: authLoading } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const [state, setState] = useState<LoadState>({ kind: 'loading' })
  const [membership, setMembership] = useState<RecapMembership | 'unknown'>('unknown')
  const [entry, setEntry] = useState<ContributorEntry>('none')
  const addPhotosRef = useRef<HTMLButtonElement>(null)

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

  // Membership is read once the session check settles. A sign-in inside the
  // join sheet is not re-checked here: that sheet runs the join itself and
  // reports it through onJoined, and re-checking mid-sheet would swap the
  // banner (and the sheet) out from under step 3.
  useEffect(() => {
    if (authLoading) return
    let cancelled = false
    fetchRecapMembership(token)
      .then((next) => {
        if (!cancelled) setMembership(next)
      })
      .catch((err) => {
        logger.error('recap membership check failed', err)
        if (!cancelled) setMembership('not-member')
      })
    return () => {
      cancelled = true
    }
  }, [token, authLoading])

  // Signing out (anywhere on the page) ends contributor mode.
  useEffect(() => {
    if (!authLoading && !user) setMembership((current) => (current === 'member' ? 'not-member' : current))
  }, [authLoading, user])

  // A member has nothing to join: drop ?join=1 / ?invite=1 so they can't act later.
  useEffect(() => {
    if (membership !== 'member') return
    if (!searchParams.has(JOIN_PARAM) && !searchParams.has(INVITE_PARAM)) return
    const next = new URLSearchParams(searchParams)
    next.delete(JOIN_PARAM)
    next.delete(INVITE_PARAM)
    setSearchParams(next, { replace: true })
  }, [membership, searchParams, setSearchParams])

  /**
   * Reloads the recap in place (after an upload, a delete or a join). A link
   * that stopped being active shows as inactive; any other failed reload
   * (offline, rate limit) keeps what is on screen.
   * @returns true when the page now shows the freshly loaded recap, false when the reload failed
   */
  const reload = useCallback(async (): Promise<boolean> => {
    try {
      const next = await loadRecap(token)
      const linkGone = next.kind === 'failed' && next.message === RECAP_INACTIVE_MESSAGE
      if (next.kind === 'ready' || linkGone) {
        setState(next)
        return true
      }
      logger.warn('recap reload failed; keeping the recap on screen')
    } catch (err) {
      logger.error('recap reload failed', err)
    }
    return false
  }, [token])

  /** After a failed contributor action: a lapsed session or removed membership must not leave contributor mode up. */
  const recheckMembership = useCallback(() => {
    fetchRecapMembership(token)
      .then((next) => setMembership(next))
      .catch((err) => logger.error('recap membership re-check failed', err))
  }, [token])

  const contributions = useRecapContributions(token, reload, recheckMembership)

  /**
   * The join went through: switch to contributor mode and reload, so any
   * photos this account uploaded before come back marked `mine`.
   * @param addPhotosNow - Open the stop picker straight away
   */
  function onJoined(addPhotosNow: boolean): void {
    setEntry(addPhotosNow ? 'open-sheet' : 'focus-button')
    setMembership('member')
    void reload()
  }

  // "{trip} recap" once loaded; plain "Trip recap" while loading or when the
  // link is inactive (appending "recap" to that fallback read "Trip recap recap").
  const pageTitle =
    state.kind === 'ready' ? `${state.payload.title ?? `${state.payload.displayName} trip`} recap` : 'Trip recap'

  const isMember = membership === 'member'

  return (
    <main id="main" className="chronicle-page chronicle-recap-public">
      {/* noindex: a share link is meant for the people it was sent to, not search results. */}
      <Seo title={pageTitle} description="A trip recap shared from Trip One." noindex />
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
            belowHeader={
              membership === 'unknown' ? null : isMember ? (
                <ContributorBanner
                  payload={state.payload}
                  contributions={contributions}
                  addButtonRef={addPhotosRef}
                  entry={entry}
                />
              ) : (
                <AddPhotosBanner token={token} tripPhrase={tripPhrase(state.payload)} onJoined={onJoined} />
              )
            }
            contributor={
              isMember ? { onRemovePhoto: (photoId) => void contributions.remove(photoId), addButtonRef: addPhotosRef } : undefined
            }
          />
        )}
      </div>
    </main>
  )
}
