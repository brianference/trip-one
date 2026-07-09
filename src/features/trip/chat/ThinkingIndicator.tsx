/**
 * The three-dot "thinking" indicator shown while the planner works — the
 * Daisy Dog typing-indicator pattern. Animation lives in CSS
 * (.chronicle-chat-dots) so it stays lightweight (no motion library).
 */
export function ThinkingIndicator() {
  return (
    <div className="chronicle-chat-row chronicle-chat-row--assistant">
      <div className="chronicle-chat-bubble chronicle-chat-bubble--assistant" aria-label="Planner is thinking">
        <span className="chronicle-chat-dots" aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
      </div>
    </div>
  )
}
