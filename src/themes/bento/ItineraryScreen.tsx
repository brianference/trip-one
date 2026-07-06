import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useTripStore } from '../../store/tripStore'

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
    <div className="bento-app-screen bento-itinerary">
      {id && (
        <nav className="bento-app-nav">
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
      <form onSubmit={handleSubmit} className="bento-itinerary-form">
        <div>
          <label htmlFor="stop-time">Time</label>
          <input id="stop-time" value={time} onChange={(e) => setTime(e.target.value)} />
        </div>
        <div>
          <label htmlFor="stop-text">What</label>
          <input id="stop-text" value={text} onChange={(e) => setText(e.target.value)} />
        </div>
        <button type="submit" className="bento-btn">
          Add stop
        </button>
      </form>
      <ul className="bento-timeline">
        {itinerary.map((item, i) => (
          <li key={`${item.time}-${item.text}-${i}`} className="bento-timeline-item">
            <span className={`bento-timeline-dot bento-timeline-dot--${item.type}`} aria-hidden="true" />
            <span className="bento-timeline-text">
              {item.time && <span className="bento-timeline-time">{item.time}</span>}
              {item.text}
            </span>
            <button type="button" className="bento-timeline-remove" onClick={() => removeItem(i)} aria-label={`Remove ${item.text}`}>
              ×
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
