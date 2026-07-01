import { useState } from 'react'
import { useTripStore } from '../../store/tripStore'

/**
 * Itinerary screen for Liquid Glass theme — displays items in a frosted glass card with add/remove functionality.
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
    <div className="lg-glass-card">
      <form onSubmit={handleSubmit}>
        <label htmlFor="lg-stop-time">Time</label>
        <input id="lg-stop-time" value={time} onChange={(e) => setTime(e.target.value)} className="lg-tap-target" />
        <label htmlFor="lg-stop-text">What</label>
        <input id="lg-stop-text" value={text} onChange={(e) => setText(e.target.value)} className="lg-tap-target" />
        <button type="submit" className="lg-tap-target">Add stop</button>
      </form>
      <ul>
        {itinerary.map((item, i) => (
          <li key={`${item.time}-${item.text}-${i}`}>
            <span>{item.time}</span>
            <span> — </span>
            <span>{item.text}</span>
            <button
              type="button"
              onClick={() => removeItem(i)}
              aria-label={`Remove ${item.text}`}
              className="lg-tap-target"
            >
              ×
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
