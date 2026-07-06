import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useTripStore } from '../../store/tripStore'

/**
 * Itinerary screen for Liquid Glass theme — displays items in a frosted glass card with add/remove functionality.
 */
export function ItineraryScreen() {
  const { id } = useParams<{ id: string }>()
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
    <div className="lg-app-screen">
      {id && (
        <nav className="lg-nav">
          <Link className="lg-tap-target lg-nav-link" to={`/trip/${id}`}>
            Overview
          </Link>
          <Link className="lg-tap-target lg-nav-link" to={`/trip/${id}/itinerary`} aria-current="page">
            Itinerary
          </Link>
          <Link className="lg-tap-target lg-nav-link" to={`/trip/${id}/things-to-do`}>
            Things to do
          </Link>
          <Link className="lg-tap-target lg-nav-link" to={`/trip/${id}/local-info`}>
            Local info
          </Link>
        </nav>
      )}
      <div className="lg-glass-card">
        <form onSubmit={handleSubmit} className="lg-itinerary-form">
          <div className="lg-field">
            <label htmlFor="lg-stop-time" className="lg-label">Time</label>
            <input
              id="lg-stop-time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="lg-tap-target lg-input"
            />
          </div>
          <div className="lg-field lg-field-grow">
            <label htmlFor="lg-stop-text" className="lg-label">What</label>
            <input
              id="lg-stop-text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="lg-tap-target lg-input"
            />
          </div>
          <button type="submit" className="lg-tap-target lg-btn lg-btn-primary">
            Add stop
          </button>
        </form>
        <ul className="lg-timeline">
          {itinerary.map((item, i) => (
            <li key={`${item.time}-${item.text}-${i}`} className="lg-timeline-item">
              <span className="lg-timeline-time">{item.time}</span>
              <span className="lg-timeline-text">{item.text}</span>
              <button
                type="button"
                onClick={() => removeItem(i)}
                aria-label={`Remove ${item.text}`}
                className="lg-tap-target lg-remove-btn"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
