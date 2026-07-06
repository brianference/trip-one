import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useTripStore } from '../../store/tripStore'

const DOT_COLOR: Record<string, string> = { fixed: '#a5d088', travel: '#ffd700', option: '#5ba3ff' }

/**
 * Itinerary screen for Chronicle theme — displays items as vertical timeline with colored dots.
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
    <div className="chronicle-page">
      <div className="chronicle-timeline">
        {id && (
          <nav>
            <Link to={`/trip/${id}`}>Overview</Link>
            {' · '}
            <Link to={`/trip/${id}/itinerary`} aria-current="page">
              Itinerary
            </Link>
            {' · '}
            <Link to={`/trip/${id}/things-to-do`}>Things to do</Link>
            {' · '}
            <Link to={`/trip/${id}/local-info`}>Local info</Link>
          </nav>
        )}
        <h1 className="chronicle-timeline-heading">The itinerary</h1>
        <form className="chronicle-stop-form" onSubmit={handleSubmit}>
          <div>
            <label htmlFor="chronicle-stop-time">Time</label>
            <input id="chronicle-stop-time" value={time} onChange={(e) => setTime(e.target.value)} />
          </div>
          <div>
            <label htmlFor="chronicle-stop-text">What</label>
            <input id="chronicle-stop-text" value={text} onChange={(e) => setText(e.target.value)} />
          </div>
          <button type="submit" className="chronicle-stop-submit">
            Add stop
          </button>
        </form>
        <ol>
          {itinerary.map((item, i) => (
            <li key={`${item.time}-${item.text}-${i}`} className="chronicle-entry">
              <span data-testid={`timeline-dot-${item.type}`} style={{ background: DOT_COLOR[item.type] }} />
              <span className="chronicle-entry-time">{item.time}</span>
              <span className="chronicle-entry-text">{item.text}</span>
              <button type="button" className="chronicle-entry-remove" onClick={() => removeItem(i)} aria-label={`Remove ${item.text}`}>
                ×
              </button>
            </li>
          ))}
        </ol>
      </div>
    </div>
  )
}
