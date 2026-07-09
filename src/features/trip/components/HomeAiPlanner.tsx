import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { extractTripIntent, fetchLocation, createTrip, updateTrip, generatePlan } from '../../../lib/api/client'
import { planToItinerary } from '../../../lib/itinerary/planToItinerary'
import { stashOpeningChat } from '../chat/chatHandoff'
import { logger } from '../../../lib/logger'

const MAX_CANDIDATES = 40
const DEFAULT_DAYS = 3

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
      const location = await fetchLocation(intent.destination)
      if (location.thingsToDo.length === 0) {
        setError(`I couldn’t find things to do in ${intent.destination}. Try a nearby city.`)
        return
      }

      const trip = await createTrip(location.slug, 'chronicle')
      const days = intent.days ?? DEFAULT_DAYS
      const candidatePlaces = [...location.thingsToDo]
        .sort((a, b) => (b.rating ?? -Infinity) - (a.rating ?? -Infinity))
        .slice(0, MAX_CANDIDATES)

      setStatus('Building your itinerary…')
      const plan = await generatePlan(
        intent.interests,
        days,
        candidatePlaces.map((p) => ({ name: p.name, category: p.category, rating: p.rating })),
      )
      const itinerary = planToItinerary(plan.days, candidatePlaces)
      await updateTrip(trip.id, { itinerary, tripLengthDays: days })
      // Seed the itinerary chat with this opening exchange so refining feels
      // continuous — the traveler's sentence, then the planner's first reply.
      const now = Date.now()
      stashOpeningChat(trip.id, [
        { id: `open-user-${now}`, role: 'user', text: request.trim(), ts: now },
        {
          id: `open-ai-${now}`,
          role: 'assistant',
          text: plan.message || `Here’s a ${days}-day trip to ${intent.destination}. Tell me what to change.`,
          ts: now + 1,
        },
      ])
      navigate(`/trip/${trip.id}/itinerary`)
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
    <form className="chronicle-home-ai" onSubmit={handleSubmit} aria-labelledby="chronicle-home-ai-heading">
      <p className="chronicle-ai-kicker">✨ Your AI Trip</p>
      <h2 id="chronicle-home-ai-heading" className="chronicle-home-ai-heading">
        Describe your trip
      </h2>
      <p className="chronicle-home-ai-sub">
        Say where you want to go and what you’re after — we’ll build a real day-by-day plan from actual places there.
      </p>
      <textarea
        className="chronicle-ai-input"
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
      <button type="submit" className="chronicle-ai-submit chronicle-home-ai-submit" disabled={busy || !text.trim()}>
        {busy ? status || 'Planning…' : 'Plan my trip'}
      </button>

      <div className="chronicle-ai-suggestions" aria-label="Suggested trips">
        <span className="chronicle-ai-suggestions-label">Or try one of these</span>
        <ul>
          {SUGGESTED_PROMPTS.map((prompt) => (
            <li key={prompt}>
              <button
                type="button"
                className="chronicle-ai-suggestion"
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
        <p role="alert" className="chronicle-ai-error">
          {error}
        </p>
      )}
    </form>
  )
}
