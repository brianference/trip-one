import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { extractTripIntent } from '../../../lib/api/client'
import { createTripForDestination } from '../planning/createTripForDestination'
import { stashOpeningChat } from '../chat/chatHandoff'
import { TripBuildingOverlay } from './TripBuildingOverlay'
import { logger } from '../../../lib/logger'

// Full-sentence prompts (destination included) — tapping one plans a whole
// trip end to end, the "Plan with AI" pattern.
const SUGGESTED_PROMPTS = [
  'A fun 9-day San Diego trip with kids, lots of stops',
  '3 relaxed days in Lisbon — food and history',
  'A long weekend in Tokyo: ramen, gardens, and neighborhoods',
  'Kid-friendly 4 days in Barcelona, easy walking',
  'A foodie trip to Mexico City, top-rated spots',
]

/**
 * The homepage AI planner: describe a whole trip in one sentence (including
 * where) and it builds a real, grounded itinerary end to end — extract the
 * destination and preferences, create the trip, plan it from the destination's
 * real nearby places, and open the finished itinerary. Every stop is a real
 * place; nothing is invented.
 */
export function HomeAiPlanner() {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()

  async function planTrip(request: string) {
    if (!request.trim() || busy) return
    setBusy(true)
    setError(null)
    try {
      setStatus('Reading your request…')
      const intent = await extractTripIntent(request.trim())
      if (!intent.destination) {
        setError('Tell me where you’d like to go — e.g. “a fun 3 days in Rome with great food”.')
        return
      }

      setStatus(`Finding real places in ${intent.destination}…`)
      const built = await createTripForDestination({
        destination: intent.destination,
        interests: intent.interests,
        requestedDays: intent.days,
        party: intent.party,
        occasion: intent.occasion,
        season: intent.season,
        audience: intent.audience,
        foodFocused: intent.foodFocused,
      })
      // Seed the itinerary chat with this opening exchange so refining feels
      // continuous — the traveler's sentence, then the planner's first reply.
      const now = Date.now()
      stashOpeningChat(built.tripId, [
        { id: `open-user-${now}`, role: 'user', text: request.trim(), ts: now },
        {
          id: `open-ai-${now}`,
          role: 'assistant',
          text: built.message || `Here’s a ${built.days}-day trip to ${built.destinationName}. Tell me what to change.`,
          ts: now + 1,
        },
      ])
      // Land on the trip's Overview dashboard (map + itinerary + things-to-do +
      // weather previews), not the bare itinerary page.
      navigate(`/trip/${built.tripId}`)
    } catch (err) {
      logger.error('home AI trip planning failed', err)
      setError(err instanceof Error ? err.message : 'Something went wrong. Try again.')
    } finally {
      setBusy(false)
      setStatus('')
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    void planTrip(text)
  }

  return (
    <>
      {busy && <TripBuildingOverlay status={status} />}
      <form onSubmit={handleSubmit} aria-labelledby="chronicle-home-ai-heading">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--accent-text)]">✨ Your AI Trip</p>
      <h2 id="chronicle-home-ai-heading" className="mt-1.5 font-[family-name:var(--font-display)] text-xl font-semibold">
        Describe your trip
      </h2>
      <p className="mt-1.5 text-sm leading-relaxed opacity-75">
        Say where you want to go and what you’re after — we’ll build a real day-by-day plan from actual places there.
      </p>
      <textarea
        className="mt-3 w-full resize-none rounded-xl border border-[var(--hairline)] bg-[var(--surface)] px-3.5 py-3 text-base disabled:opacity-60"
        value={text}
        onChange={(e) => {
          setText(e.target.value)
          setError(null)
        }}
        placeholder="e.g. A fun 9-day San Diego trip with kids and lots of stops"
        rows={3}
        maxLength={500}
        disabled={busy}
      />
      <button
        type="submit"
        className="mt-3 min-h-[52px] w-full rounded-[var(--radius-pill)] bg-dusk-500 px-6 text-base font-semibold text-[var(--color-on-accent)] transition-colors hover:bg-dusk-400 disabled:opacity-40"
        disabled={busy || !text.trim()}
      >
        {busy ? status || 'Planning…' : 'Plan my trip'}
      </button>

      <div className="mt-4" aria-label="Suggested trips">
        <span className="text-xs font-medium uppercase tracking-wider opacity-60">Or try one of these</span>
        <ul className="mt-2 flex flex-wrap gap-2">
          {SUGGESTED_PROMPTS.map((prompt) => (
            <li key={prompt}>
              <button
                type="button"
                className="min-h-[44px] rounded-[var(--radius-pill)] border border-[var(--hairline)] px-3.5 text-sm hover:bg-[var(--surface-muted)] disabled:opacity-50"
                onClick={() => {
                  setText(prompt)
                  void planTrip(prompt)
                }}
                disabled={busy}
              >
                {prompt}
              </button>
            </li>
          ))}
        </ul>
      </div>

      {error && (
        <p role="alert" className="mt-3 text-sm text-danger-500">
          {error}
        </p>
      )}
      </form>
    </>
  )
}
