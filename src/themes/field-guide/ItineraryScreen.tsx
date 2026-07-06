import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useTripStore } from '../../store/tripStore'

/**
 * Itinerary screen for Field Guide theme — displays trip itinerary as postcard grid.
 */
export function ItineraryScreen() {
  const { id } = useParams<{ id: string }>()
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
    <div className="field-guide-app-screen field-guide-postcards">
      {id && (
        <ul className="field-guide-nav">
          <li>
            <Link to={`/trip/${id}`}>Overview</Link>
          </li>
          <li>
            <Link to={`/trip/${id}/itinerary`} aria-current="page">
              Itinerary
            </Link>
          </li>
          <li>
            <Link to={`/trip/${id}/things-to-do`}>Things to do</Link>
          </li>
          <li>
            <Link to={`/trip/${id}/local-info`}>Local info</Link>
          </li>
        </ul>
      )}
      <p className="field-guide-eyebrow">Trip itinerary</p>
      <form onSubmit={handleSubmit} className="field-guide-form">
        <div className="field-guide-field">
          <label htmlFor="fg-stop-time">Time</label>
          <input id="fg-stop-time" value={time} onChange={(e) => setTime(e.target.value)} />
        </div>
        <div className="field-guide-field">
          <label htmlFor="fg-stop-text">What</label>
          <input id="fg-stop-text" value={text} onChange={(e) => setText(e.target.value)} />
        </div>
        <button type="submit" className="field-guide-btn">
          Add stop
        </button>
      </form>
      <div className="field-guide-postcard-grid">
        {itinerary.map((item, i) => (
          <div key={`${item.time}-${item.text}-${i}`} className="field-guide-postcard">
            <button
              type="button"
              className="field-guide-btn field-guide-btn--icon field-guide-postcard-remove"
              onClick={() => removeItem(i)}
              aria-label={`Remove ${item.text}`}
            >
              ×
            </button>
            <p className="field-guide-postcard-time">{item.time || 'Anytime'}</p>
            <p className="field-guide-postcard-title">{item.text}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
