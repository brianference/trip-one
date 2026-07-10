import { useEffect, useRef, useState } from 'react'
import type { ChatMessage, ChatPlace } from './chatTypes'
import { chatStartersFor } from './chatTypes'
import { ChatMessageBubble } from './ChatMessageBubble'
import { ThinkingIndicator } from './ThinkingIndicator'

/**
 * The persistent left-rail itinerary chat, modeled on Tripadvisor's AI
 * Assistant panel and the Daisy Dog chat: a scrolling message list, a live
 * "thinking" indicator, tappable starters when the conversation is young, and
 * a composer. Purely presentational — all planning state lives in
 * useTripChat; this renders it and forwards the composer text up via onSend.
 */
export function TripChatPanel({
  messages,
  isThinking,
  error,
  disabled,
  onSend,
  locationName,
  onClose,
  pendingRelocate,
  onConfirmRelocate,
  onCancelRelocate,
  onPlaceClick,
}: {
  messages: ChatMessage[]
  isThinking: boolean
  error: string | null
  disabled: boolean
  onSend: (text: string) => void
  /** Destination display name, used to make the starter prompts place-aware. */
  locationName?: string
  /** When provided, shows a collapse button (the panel is a toggleable rail/drawer). */
  onClose?: () => void
  /** A detected destination change awaiting confirmation (null when none). */
  pendingRelocate?: { destination: string } | null
  onConfirmRelocate?: () => void
  onCancelRelocate?: () => void
  /** Tapping an added-place chip reveals it on the Plan page. */
  onPlaceClick?: (place: ChatPlace) => void
}) {
  const [draft, setDraft] = useState('')
  const listRef = useRef<HTMLDivElement>(null)
  const starters = chatStartersFor(locationName)

  // Keep the newest message (or the thinking indicator) in view.
  useEffect(() => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, isThinking])

  function submit(text: string) {
    const trimmed = text.trim()
    if (!trimmed || disabled || isThinking) return
    onSend(trimmed)
    setDraft('')
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    submit(draft)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Enter sends; Shift+Enter makes a newline — the common chat convention.
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit(draft)
    }
  }

  // Starters only while the conversation is still just the greeting.
  const showStarters = messages.filter((m) => m.role === 'user').length === 0 && !isThinking

  return (
    <section className="chronicle-chat" aria-label="Trip planner chat">
      <header className="chronicle-chat-header">
        {onClose && (
          <button type="button" className="chronicle-chat-collapse" onClick={onClose} aria-label="Hide chat">
            ×
          </button>
        )}
        <p className="chronicle-ai-kicker">✨ Your AI Trip</p>
        <h2 className="chronicle-chat-title">Plan by chat</h2>
        <p className="chronicle-chat-subtitle">Refine your trip in plain language — every stop stays a real place nearby.</p>
      </header>

      <div className="chronicle-chat-messages" ref={listRef} role="log" aria-live="polite" aria-busy={isThinking}>
        {messages.map((m) => (
          <ChatMessageBubble key={m.id} message={m} onPlaceClick={onPlaceClick} />
        ))}
        {isThinking && <ThinkingIndicator />}
      </div>

      {showStarters && (
        <div className="chronicle-chat-starters" aria-label="Conversation starters">
          {starters.map((starter) => (
            <button key={starter} type="button" className="chronicle-ai-suggestion" onClick={() => submit(starter)} disabled={disabled}>
              {starter}
            </button>
          ))}
        </div>
      )}

      {error && (
        <p role="alert" className="chronicle-ai-error chronicle-chat-error">
          {error}
        </p>
      )}

      {pendingRelocate && onConfirmRelocate && onCancelRelocate && (
        <div className="chronicle-chat-confirm" role="group" aria-label={`Start a new trip to ${pendingRelocate.destination}?`}>
          <button type="button" className="chronicle-chat-confirm-yes" onClick={onConfirmRelocate} disabled={isThinking}>
            Yes, start it
          </button>
          <button type="button" className="chronicle-chat-confirm-no" onClick={onCancelRelocate} disabled={isThinking}>
            No, stay here
          </button>
        </div>
      )}

      <form className="chronicle-chat-composer" onSubmit={handleSubmit}>
        <label htmlFor="chronicle-chat-input" className="chronicle-sr-only">
          Message the trip planner
        </label>
        <textarea
          id="chronicle-chat-input"
          className="chronicle-chat-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={disabled ? 'No nearby places to plan from yet' : 'Ask to add, remove, or reshape days…'}
          rows={2}
          maxLength={500}
          disabled={disabled || isThinking}
        />
        <button type="submit" className="chronicle-chat-send" disabled={disabled || isThinking || !draft.trim()} aria-label="Send">
          {isThinking ? '…' : 'Send'}
        </button>
      </form>
    </section>
  )
}
