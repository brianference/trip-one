import { useState } from 'react'
import { generatePlan, type ThingToDo, type PlanDay } from '../../../lib/api/client'
import { logger } from '../../../lib/logger'

const DAY_OPTIONS = Array.from({ length: 14 }, (_, i) => i + 1)

// The backend caps the candidate list (prompt size / cost), so send the
// top-rated N. The plan's indices map into THIS list, so the same subset is
// handed to onPlan for grounding — never the full, larger list.
const MAX_CANDIDATES = 40

// Ready-made prompts a traveler can tap instead of typing — the "Or ask
// anything" pattern. Each is intent-driven (pace + interests), which is
// exactly what the grounded planner reasons over against the real nearby
// places, so any of them works for any destination.
const SUGGESTED_PROMPTS = [
  'A relaxed trip with the best food and history',
  'Kid-friendly, easy walking, one museum a day',
  'A foodie trip — top-rated restaurants and cafés',
  'Outdoors and scenic views, with minimal indoor time',
  'A packed sightseeing trip hitting the top-rated spots',
]

/**
 * The grounded natural-language planner UI, styled after the "Plan with AI"
 * pattern: a free-text box plus tappable suggested prompts. The traveler
 * describes (or picks) the trip they want; the backend builds a day-by-day
 * plan from the real nearby places (`places`) and it's handed back via
 * `onPlan`. The model can only pick from `places`, so nothing is fabricated.
 */
export function AiPlanner({
  places,
  defaultDays,
  onPlan,
}: {
  places: ThingToDo[]
  defaultDays: number
  onPlan: (plan: PlanDay[], days: number, candidatePlaces: ThingToDo[]) => void
}) {
  const [intent, setIntent] = useState('')
  const [days, setDays] = useState(defaultDays)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const disabled = busy || places.length === 0

  async function runPlan(text: string) {
    if (!text.trim() || disabled) return
    setBusy(true)
    setError(null)
    try {
      // Take the top-rated MAX_CANDIDATES so we stay under the backend cap;
      // the plan's indices map into exactly this subset.
      const candidatePlaces = [...places]
        .sort((a, b) => (b.rating ?? -Infinity) - (a.rating ?? -Infinity))
        .slice(0, MAX_CANDIDATES)
      const candidates = candidatePlaces.map((p) => ({ name: p.name, category: p.category, rating: p.rating }))
      const plan = await generatePlan(text.trim(), days, candidates)
      onPlan(plan, days, candidatePlaces)
      setIntent('')
    } catch (err) {
      logger.error('AI plan generation failed', err)
      setError(err instanceof Error ? err.message : 'Could not build a plan. Try again.')
    } finally {
      setBusy(false)
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    void runPlan(intent)
  }

  function handleSuggestion(prompt: string) {
    setIntent(prompt)
    void runPlan(prompt)
  }

  return (
    <form className="chronicle-ai-planner" onSubmit={handleSubmit} aria-labelledby="chronicle-ai-heading">
      <p className="chronicle-ai-kicker">✨ Plan with AI</p>
      <h2 id="chronicle-ai-heading" className="chronicle-ai-heading">
        Tell me the trip you want
      </h2>
      <p className="chronicle-ai-sub">
        Describe it in a sentence, or tap an idea below. Every stop is picked from real places nearby — nothing invented.
      </p>
      <textarea
        className="chronicle-ai-input"
        value={intent}
        onChange={(e) => {
          setIntent(e.target.value)
          setError(null)
        }}
        placeholder="e.g. 3 relaxed days, love food and history, easy walking, one museum a day"
        rows={3}
        maxLength={500}
      />
      <div className="chronicle-ai-controls">
        <label className="chronicle-ai-days">
          <span>Days</span>
          <select value={days} onChange={(e) => setDays(Number(e.target.value))}>
            {DAY_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="chronicle-ai-submit" disabled={disabled || !intent.trim()}>
          {busy ? 'Building…' : 'Build my itinerary'}
        </button>
      </div>

      {places.length > 0 && (
        <div className="chronicle-ai-suggestions" aria-label="Suggested prompts">
          <span className="chronicle-ai-suggestions-label">Or try one of these</span>
          <ul>
            {SUGGESTED_PROMPTS.map((prompt) => (
              <li key={prompt}>
                <button type="button" className="chronicle-ai-suggestion" onClick={() => handleSuggestion(prompt)} disabled={disabled}>
                  {prompt}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {places.length === 0 && <p className="chronicle-ai-note">No nearby places found yet, so there’s nothing to plan from.</p>}
      {error && (
        <p role="alert" className="chronicle-ai-error">
          {error}
        </p>
      )}
    </form>
  )
}
