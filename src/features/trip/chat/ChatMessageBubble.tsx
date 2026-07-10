import type { ChatMessage, ChatPlace } from './chatTypes'

function formatTime(ts: number): string {
  try {
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  } catch {
    return ''
  }
}

/**
 * A single chat bubble. User and assistant messages sit on opposite sides and
 * animate in (.chronicle-chat-row entry keyframe). An assistant message that
 * added places renders them as tappable chips — tapping one reveals the place
 * on the Plan page (opens its detail, selects its day, pans the map to it).
 */
export function ChatMessageBubble({ message, onPlaceClick }: { message: ChatMessage; onPlaceClick?: (place: ChatPlace) => void }) {
  const isUser = message.role === 'user'
  return (
    <div className={`chronicle-chat-row chronicle-chat-row--${isUser ? 'user' : 'assistant'}`}>
      <div className={`chronicle-chat-bubble chronicle-chat-bubble--${isUser ? 'user' : 'assistant'}`}>
        <p className="chronicle-chat-text">{message.text}</p>
        {message.places && message.places.length > 0 && (
          <div className="chronicle-chat-places">
            {message.places.map((place) => (
              <button
                key={`${place.name}-${place.day}`}
                type="button"
                className="chronicle-chat-place"
                onClick={() => onPlaceClick?.(place)}
                title={`Show ${place.name} on the map`}
              >
                <span className="chronicle-chat-place-name">{place.name}</span>
                <span className="chronicle-chat-place-day">Day {place.day}</span>
              </button>
            ))}
          </div>
        )}
        <span className="chronicle-chat-time">{formatTime(message.ts)}</span>
      </div>
    </div>
  )
}
