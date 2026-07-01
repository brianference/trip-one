import { useState } from 'react'
import { useTripStore } from '../../store/tripStore'

/**
 * Itinerary screen for Field Guide theme — displays trip itinerary as postcard grid.
 */
export function ItineraryScreen() {
  const [time, setTime] = useState('')
  const [text, setText] = useState('')
  const itinerary = useTripStore((s) => s.itinerary)
  const addItem = useTripStore((s) => s.addItem)
  const removeItem = useTripStore((s) => s.removeItem)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!time || !text) return
    addItem({ time, text, type: 'option' })
    setTime('')
    setText('')
  }

  return (
    <div className="field-guide-postcards">
      <form onSubmit={handleSubmit}>
        <label htmlFor="fg-stop-time">Time</label>
        <input id="fg-stop-time" value={time} onChange={(e) => setTime(e.target.value)} />
        <label htmlFor="fg-stop-text">What</label>
        <input id="fg-stop-text" value={text} onChange={(e) => setText(e.target.value)} />
        <button type="submit">Add stop</button>
      </form>
      <div className="field-guide-postcard-grid">
        {itinerary.map((item, i) => (
          <div key={`${item.time}-${item.text}-${i}`} className="field-guide-postcard">
            <p>
              {item.time} — <span>{item.text}</span>
            </p>
            <button type="button" onClick={() => removeItem(i)} aria-label={`Remove ${item.text}`}>
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
