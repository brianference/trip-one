import type { ChatMessage } from './chatTypes'

function formatTime(ts: number): string {
  try {
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  } catch {
    return ''
  }
}

/**
 * A single chat bubble. User and assistant messages sit on opposite sides and
 * animate in (.chronicle-chat-row entry keyframe), the Daisy Dog message-bubble
 * pattern adapted to the Chronicle theme.
 */
export function ChatMessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user'
  return (
    <div className={`chronicle-chat-row chronicle-chat-row--${isUser ? 'user' : 'assistant'}`}>
      <div className={`chronicle-chat-bubble chronicle-chat-bubble--${isUser ? 'user' : 'assistant'}`}>
        <p className="chronicle-chat-text">{message.text}</p>
        <span className="chronicle-chat-time">{formatTime(message.ts)}</span>
      </div>
    </div>
  )
}
