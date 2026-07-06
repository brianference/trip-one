import { useState } from 'react'
import { useTripStore } from '../../store/tripStore'

/**
 * Itinerary screen for Trail Ledger theme — displays and manages trip stops in table format.
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
    <div className="tl-screen tl-ledger">
      <div className="tl-container">
        <h1 className="tl-page-title">Itinerary</h1>
        <form className="tl-form" onSubmit={handleSubmit}>
          <div>
            <label htmlFor="tl-stop-time">Time</label>
            <input id="tl-stop-time" value={time} onChange={(e) => setTime(e.target.value)} />
          </div>
          <div>
            <label htmlFor="tl-stop-text">What</label>
            <input id="tl-stop-text" value={text} onChange={(e) => setText(e.target.value)} />
          </div>
          <button type="submit" className="tl-btn">
            Add stop
          </button>
        </form>
        <table className="tl-table">
          <thead>
            <tr>
              <th>Time</th>
              <th>Stop</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {itinerary.map((item, i) => (
              <tr key={`${item.time}-${item.text}-${i}`}>
                <td>{item.time}</td>
                <td>{item.text}</td>
                <td>
                  <button
                    type="button"
                    className="tl-btn-remove"
                    onClick={() => removeItem(i)}
                    aria-label={`Remove ${item.text}`}
                  >
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
