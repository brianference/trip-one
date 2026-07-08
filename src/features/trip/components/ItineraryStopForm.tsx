import { useState } from 'react'

/** The "add a stop" form: time, what, and an optional location to geocode. */
export function ItineraryStopForm({
  onSubmit,
  submitting,
}: {
  onSubmit: (input: { time: string; text: string; locationText: string }) => void
  submitting: boolean
}) {
  const [time, setTime] = useState('')
  const [text, setText] = useState('')
  const [locationText, setLocationText] = useState('')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!time || !text) return
    onSubmit({ time, text, locationText })
    setTime('')
    setText('')
    setLocationText('')
  }

  return (
    <form className="chronicle-stop-form" onSubmit={handleSubmit}>
      <div>
        <label htmlFor="chronicle-stop-time">Time</label>
        <input id="chronicle-stop-time" value={time} onChange={(e) => setTime(e.target.value)} />
      </div>
      <div>
        <label htmlFor="chronicle-stop-text">What</label>
        <input id="chronicle-stop-text" value={text} onChange={(e) => setText(e.target.value)} />
      </div>
      <div>
        <label htmlFor="chronicle-stop-location">Location (optional)</label>
        <input
          id="chronicle-stop-location"
          value={locationText}
          onChange={(e) => setLocationText(e.target.value)}
          placeholder="e.g. Eiffel Tower"
        />
      </div>
      <button type="submit" className="chronicle-stop-submit" disabled={submitting}>
        {submitting ? 'Adding…' : 'Add stop'}
      </button>
    </form>
  )
}
