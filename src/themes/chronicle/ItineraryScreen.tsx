import { useState } from 'react'
import { useTripStore } from '../../store/tripStore'

const DOT_COLOR: Record<string, string> = { fixed: '#a5d088', travel: '#ffd700', option: '#5ba3ff' }

/**
 * Itinerary screen for Chronicle theme — displays items as vertical timeline with colored dots.
 */
export function ItineraryScreen() {
  const [time, setTime] = useState('')
  const [text, setText] = useState('')
  const itinerary = useTripStore((s) => s.itinerary)
  const addItem = useTripStore((s) => s.addItem)
  const removeItem = useTripStore((s) => s.removeItem)

  /**
   * Handle form submission — add item to itinerary and reset form.
   */
  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!time || !text) return
    addItem({ time, text, type: 'option' })
    setTime('')
    setText('')
  }

  return (
    <div className="chronicle-timeline">
      <form onSubmit={handleSubmit}>
        <label htmlFor="chronicle-stop-time">Time</label>
        <input id="chronicle-stop-time" value={time} onChange={(e) => setTime(e.target.value)} />
        <label htmlFor="chronicle-stop-text">What</label>
        <input id="chronicle-stop-text" value={text} onChange={(e) => setText(e.target.value)} />
        <button type="submit">Add stop</button>
      </form>
      <ol>
        {itinerary.map((item, i) => (
          <li key={`${item.time}-${item.text}-${i}`} className="chronicle-entry">
            <span data-testid={`timeline-dot-${item.type}`} style={{ background: DOT_COLOR[item.type] }} />
            <span>{item.time}</span>
            <span> — </span>
            <span>{item.text}</span>
            <button type="button" onClick={() => removeItem(i)} aria-label={`Remove ${item.text}`}>
              ×
            </button>
          </li>
        ))}
      </ol>
    </div>
  )
}
