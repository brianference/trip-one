import { useState } from 'react'
import { useTripStore } from '../../store/tripStore'

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
    <div className="bento-itinerary">
      <form onSubmit={handleSubmit}>
        <label htmlFor="stop-time">Time</label>
        <input id="stop-time" value={time} onChange={(e) => setTime(e.target.value)} />
        <label htmlFor="stop-text">What</label>
        <input id="stop-text" value={text} onChange={(e) => setText(e.target.value)} />
        <button type="submit">Add stop</button>
      </form>
      <ul>
        {itinerary.map((item, i) => (
          <li key={`${item.time}-${item.text}-${i}`}>
            {item.time} — {item.text}
            <button type="button" onClick={() => removeItem(i)} aria-label={`Remove ${item.text}`}>
              ×
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
