import { useId, useState } from 'react'
import { logger } from '../../lib/logger'

/** Shown when the create request fails with no usable server message (e.g. offline). */
const FALLBACK_ERROR_MESSAGE = 'We couldn’t create a recap link. Please try again in a moment.'

/** Path segment of the trip's own URL, which grants edit access and must never be shared from here. */
const TRIP_PATH_SEGMENT = '/trip/'

/** What the component is showing after a press. */
type ShareState =
  | { kind: 'idle' }
  | { kind: 'working' }
  | { kind: 'copied' }
  | { kind: 'manual'; url: string }
  | { kind: 'error'; message: string }

/**
 * Asks the server for the trip's read-only recap token (idempotent: the same
 * active token comes back every time).
 * @param tripId - The trip to share
 * @returns The recap token
 * @throws With the server's own `error` text when the request is refused
 */
async function fetchRecapToken(tripId: string): Promise<string> {
  const res = await fetch(`/api/trips/${tripId}/recap-link`, { method: 'POST' })
  const body = (await res.json().catch(() => ({}))) as { token?: unknown; error?: unknown }
  if (!res.ok || typeof body.token !== 'string') {
    throw new Error(typeof body.error === 'string' ? body.error : FALLBACK_ERROR_MESSAGE)
  }
  return body.token
}

/**
 * The public recap URL for a token. Refuses to return anything that looks
 * like a trip URL: the trip URL is an edit capability, and handing it out
 * from a "share recap" button would give every viewer edit rights.
 * @param token - The recap token
 */
function recapUrlFor(token: string): string {
  const url = `${window.location.origin}/recap/${encodeURIComponent(token)}`
  if (url.includes(TRIP_PATH_SEGMENT)) throw new Error('refusing to share a trip URL as a recap')
  return url
}

/**
 * Whether a `navigator.share` rejection means the user closed the share
 * sheet themselves (nothing more should happen) rather than a failure.
 * @param err - The rejection
 */
function isShareCancelled(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError'
}

/**
 * The owner's "Share recap" button. It gets (or creates) the trip's
 * read-only recap link and hands it to the system share sheet; where that
 * is missing or fails, it copies the link; where the clipboard is blocked
 * too, it shows the link in a read-only field to copy by hand. It never
 * opens a blocking dialog, and never shares the trip's own (editable) URL.
 */
export function ShareRecap({ tripId, tripName }: { tripId: string; tripName: string }) {
  const [state, setState] = useState<ShareState>({ kind: 'idle' })
  const inputId = useId()

  /** Runs the create-then-share flow for one press. */
  async function share() {
    setState({ kind: 'working' })
    let url: string
    try {
      url = recapUrlFor(await fetchRecapToken(tripId))
    } catch (err) {
      logger.error('recap link create failed', err)
      setState({ kind: 'error', message: err instanceof Error ? err.message : FALLBACK_ERROR_MESSAGE })
      return
    }

    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: `${tripName} recap · Trip One`, url })
        setState({ kind: 'idle' })
        return
      } catch (err) {
        if (isShareCancelled(err)) {
          setState({ kind: 'idle' })
          return
        }
        // Share sheet unavailable in this context: fall through to copying.
      }
    }

    try {
      await navigator.clipboard.writeText(url)
      setState({ kind: 'copied' })
    } catch {
      // No clipboard (insecure context, permission denied): show the link.
      setState({ kind: 'manual', url })
    }
  }

  return (
    <div className="chronicle-recap-share">
      <button
        type="button"
        className="chronicle-share-btn"
        onClick={share}
        aria-busy={state.kind === 'working' || undefined}
      >
        Share recap
      </button>
      <p role="status" className="chronicle-save-hint">
        {state.kind === 'copied' ? 'Recap link copied. Anyone with it can view, not edit.' : ''}
      </p>
      {state.kind === 'manual' && (
        <div className="chronicle-recap-share-manual">
          <label htmlFor={inputId} className="chronicle-save-hint">
            Recap link
          </label>
          <input
            id={inputId}
            type="text"
            readOnly
            value={state.url}
            className="chronicle-recap-share-input"
            onFocus={(event) => event.currentTarget.select()}
          />
        </div>
      )}
      {state.kind === 'error' && (
        <p role="alert" className="chronicle-recap-share-error">
          {state.message}
        </p>
      )}
    </div>
  )
}
