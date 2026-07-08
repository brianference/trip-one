import { useState } from 'react'
import { generatePlan, type ThingToDo, type PlanDay } from '../../../lib/api/client'
import { logger } from '../../../lib/logger'

const DAY_OPTIONS = Array.from({ length: 14 }, (_, i) => i + 1)

/**
 * The grounded natural-language planner UI. The traveler describes the trip
 * they want in plain English; on submit it asks the backend to build a
 * day-by-day plan from the real nearby places (`places`) and hands the result
 * back via `onPlan`. The model can only pick from `places`, so nothing it
 * returns is fabricated.
 */
export function AiPlanner({
  places,
  defaultDays,
  onPlan,
}: {
  places: ThingToDo[]
  defaultDays: number
  onPlan: (plan: PlanDay[], days: number) => void
}) {
  const [intent, setIntent] = useState('')
  const [days, setDays] = useState(defaultDays)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const disabled = busy || places.length === 0

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!intent.trim() || disabled) return
    setBusy(true)
    setError(null)
    try {
      const candidates = places.map((p) => ({ name: p.name, category: p.category, rating: p.rating }))
      const plan = await generatePlan(intent.trim(), days, candidates)
      onPlan(plan, days)
      setIntent('')
    } catch (err) {
      logger.error('AI plan generation failed', err)
      setError(err instanceof Error ? err.message : 'Could not build a plan. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="chronicle-ai-planner" onSubmit={handleSubmit} aria-labelledby="chronicle-ai-heading">
      <h2 id="chronicle-ai-heading" className="chronicle-ai-heading">
        Plan it for me
      </h2>
      <p className="chronicle-ai-sub">
        Describe the trip you want. Every stop is picked from real places nearby — nothing invented.
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
      {places.length === 0 && <p className="chronicle-ai-note">No nearby places found yet, so there’s nothing to plan from.</p>}
      {error && (
        <p role="alert" className="chronicle-ai-error">
          {error}
        </p>
      )}
    </form>
  )
}
